import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import Base, get_db
from app.main import app
from app.models import City, DriverAccount, DriverSession, NigerianState

PREFIX = "/api/v1"
ADMIN = {"Authorization": "Bearer " + "demo-review-" + "a" * 32}
PASSWORD = "Synthetic password 2026"
VEHICLE = {"category": "Comfort", "manufacturer": "Demo Motors", "model": "Demo Cross",
           "year": 2022, "colour": "Emerald", "registration_number": "DEMO-CAR1",
           "fuel_type": "PMS", "claimed_fuel_efficiency": 17.5}
DOCUMENTS = {"licence_placeholder": "DEMO-LIC1", "vehicle_documents_ready": True}


@pytest.fixture
def demo(monkeypatch):
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([NigerianState(id=1, name="Cross River", code="CR"),
                    City(id=1, state_id=1, name="Calabar", is_active=True),
                    City(id=2, state_id=1, name="Inactive", is_active=False)])
        db.commit()

    def database():
        with Session(engine) as db:
            yield db

    monkeypatch.setattr(settings, "driver_onboarding_demo", True)
    monkeypatch.setattr(settings, "driver_review_token", ADMIN["Authorization"].split()[1])
    monkeypatch.setitem(app.dependency_overrides, get_db, database)
    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        engine.dispose()


def registration(number=1):
    return {"full_name": f"Demo Driver {number}", "email": f"driver{number}@routena.test",
            "phone": f"+234000000000{number}", "password": PASSWORD, "city_id": 1,
            "demo_acknowledged": True}


def auth(client, number=1):
    payload = registration(number)
    result = client.post(f"{PREFIX}/drivers/register", json=payload)
    assert result.status_code == 201, result.text
    response = client.post(f"{PREFIX}/drivers/login", json={"email": payload["email"], "password": PASSWORD})
    assert response.status_code == 200, response.text
    return result.json()["id"], {"Authorization": "Bearer " + response.json()["access_token"]}


def complete(client, headers, vehicle=VEHICLE):
    assert client.put(f"{PREFIX}/drivers/me/vehicle", headers=headers, json=vehicle).status_code == 200
    assert client.put(f"{PREFIX}/drivers/me/documents", headers=headers, json=DOCUMENTS).status_code == 200
    return client.post(f"{PREFIX}/drivers/me/submit", headers=headers)


def test_demo_gate_and_city_catalog(demo, monkeypatch):
    client, _ = demo
    cities = client.get(f"{PREFIX}/drivers/cities").json()
    assert cities == [{"id": 1, "city": "Calabar", "state": "Cross River", "state_code": "CR"}]
    monkeypatch.setattr(settings, "driver_onboarding_demo", False)
    assert client.post(f"{PREFIX}/drivers/register", json=registration()).status_code == 404


def test_registration_authentication_duplicate_and_logout(demo):
    client, engine = demo
    driver_id, headers = auth(client)
    duplicate = {**registration(), "email": "DRIVER1@ROUTENA.TEST", "phone": "+2340000000009"}
    assert client.post(f"{PREFIX}/drivers/register", json=duplicate).status_code == 409
    duplicate = {**registration(), "email": "other@routena.test"}
    assert client.post(f"{PREFIX}/drivers/register", json=duplicate).status_code == 409
    assert client.post(f"{PREFIX}/drivers/login", json={"email": registration()["email"], "password": "wrong"}).status_code == 401
    response = client.get(f"{PREFIX}/drivers/me", headers=headers)
    assert response.json()["id"] == driver_id
    assert response.headers["cache-control"] == "no-store"
    with Session(engine) as db:
        assert PASSWORD not in db.get(DriverAccount, driver_id).password_hash
        assert db.scalar(select(DriverSession)).token_hash != headers["Authorization"].split()[1]
    assert client.post(f"{PREFIX}/drivers/logout", headers=headers).status_code == 204
    assert client.get(f"{PREFIX}/drivers/me", headers=headers).status_code == 401


def test_validation_and_record_isolation(demo):
    client, _ = demo
    bad = client.post(f"{PREFIX}/drivers/register", json={**registration(), "email": "person@example.com"})
    assert bad.status_code == 422
    assert PASSWORD not in bad.text
    bad = client.post(f"{PREFIX}/drivers/register", json={**registration(), "password": {"secret": PASSWORD}})
    assert bad.status_code == 422
    assert PASSWORD not in bad.text
    assert client.post(f"{PREFIX}/drivers/register", json={**registration(), "city_id": 2}).status_code == 422
    first, first_headers = auth(client)
    second, second_headers = auth(client, 2)
    assert client.get(f"{PREFIX}/drivers/me").status_code == 401
    assert client.get(f"{PREFIX}/admin/drivers/{first}", headers=second_headers).status_code == 403
    assert client.get(f"{PREFIX}/drivers/me", headers=second_headers).json()["id"] == second
    assert client.put(f"{PREFIX}/drivers/me/vehicle", headers=first_headers, json={**VEHICLE, "year": 9000}).status_code == 422
    response = client.put(f"{PREFIX}/drivers/me/vehicle", headers=first_headers, json=VEHICLE)
    assert response.status_code == 200
    vehicle = response.json()["vehicle"]
    assert vehicle["vehicle_class"] == "PREMIUM"
    assert vehicle["fuel_efficiency_verified"] is False
    assert client.get(f"{PREFIX}/drivers/me", headers=second_headers).json()["vehicle"] is None
    assert client.put(f"{PREFIX}/drivers/me/vehicle", headers=second_headers, json=VEHICLE).status_code == 409


def test_corrections_approval_suspension_and_audit(demo):
    client, _ = demo
    driver_id, headers = auth(client)
    review_url = f"{PREFIX}/admin/drivers/{driver_id}/review"
    approved = {"status": "APPROVED", "feedback": "Approved in demo"}
    assert client.post(review_url, headers=ADMIN, json=approved).status_code == 409
    assert client.post(f"{PREFIX}/drivers/me/submit", headers=headers).status_code == 409
    assert complete(client, headers).json()["status"] == "PENDING_REVIEW"
    assert client.get(f"{PREFIX}/admin/drivers", headers=ADMIN).json()[0]["id"] == driver_id
    assert client.post(review_url, headers=headers, json=approved).status_code == 403
    assert client.put(f"{PREFIX}/drivers/me/vehicle", headers=headers, json=VEHICLE).status_code == 409
    correction = client.post(review_url, headers=ADMIN, json={"status": "MORE_INFORMATION_REQUIRED",
                                                              "feedback": "Correct the model details"})
    assert correction.json()["review_feedback"] == "Correct the model details"
    assert complete(client, headers, {**VEHICLE, "model": "Demo Cross 2"}).json()["status"] == "PENDING_REVIEW"
    result = client.post(review_url, headers=ADMIN, json=approved).json()
    assert result["status"] == result["vehicle"]["status"] == "APPROVED"
    assert result["documents_verified"] is False
    assert client.get(f"{PREFIX}/admin/drivers?status=APPROVED", headers=ADMIN).json()[0]["id"] == driver_id
    result = client.post(review_url, headers=ADMIN, json={"status": "SUSPENDED", "feedback": "Demo review"}).json()
    assert result["status"] == "SUSPENDED"
    assert client.get(f"{PREFIX}/drivers/me", headers=headers).json()["status"] == "SUSPENDED"
    history = client.get(f"{PREFIX}/admin/drivers/{driver_id}", headers=ADMIN).json()["history"]
    assert [event["to_status"] for event in history] == [
        "PENDING_REVIEW", "MORE_INFORMATION_REQUIRED", "PENDING_REVIEW", "APPROVED", "SUSPENDED"]
    assert history[-1]["actor"] == "DEMO_ADMIN"


def test_rejection_requires_review_token(demo, monkeypatch):
    client, _ = demo
    driver_id, headers = auth(client)
    assert complete(client, headers).status_code == 200
    review_url = f"{PREFIX}/admin/drivers/{driver_id}/review"
    rejection = {"status": "REJECTED", "feedback": "Demo requirements incomplete"}
    legacy_admin = {"Authorization": "Bearer " + settings.admin_token}
    assert client.post(review_url, headers=legacy_admin, json=rejection).status_code == 403
    assert client.post(review_url, headers=ADMIN, json=rejection).json()["status"] == "REJECTED"
    monkeypatch.setattr(settings, "driver_review_token", None)
    assert client.get(f"{PREFIX}/admin/drivers", headers=ADMIN).status_code == 403


def test_expired_sessions_and_openapi_contract(demo):
    client, engine = demo
    _, headers = auth(client)
    with Session(engine) as db:
        db.scalar(select(DriverSession)).expires_at = 0
        db.commit()
    assert client.get(f"{PREFIX}/drivers/me", headers=headers).status_code == 401
    paths = client.get("/openapi.json").json()["paths"]
    assert paths[f"{PREFIX}/drivers/login"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert paths[f"{PREFIX}/admin/drivers/{{driver_id}}/review"]["post"]["security"] == [{"HTTPBearer": []}]
