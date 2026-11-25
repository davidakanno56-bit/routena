import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.db import Base, get_db
from app.models import City, NigerianState, PricingZone, ServiceZone
from app.routes import MockRoutesAdapter
from app.schemas import RouteResult


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([
            NigerianState(id=1, name="Cross River", code="CR"),
            City(id=1, state_id=1, name="Calabar", is_active=True),
            ServiceZone(id=1, city_id=1, name="Demo", active=True, boundary_geojson=json.dumps({
                "type": "Polygon",
                "coordinates": [[[8.29, 4.98], [8.38, 4.98], [8.38, 5.08], [8.29, 5.08], [8.29, 4.98]]],
            })),
            PricingZone(city_id=1, service_zone_id=1, name="Demo pricing"),
        ])
        db.commit()

    def session():
        with Session(engine) as db:
            yield db

    main.app.dependency_overrides[get_db] = session
    try:
        with TestClient(main.app) as test_client:
            yield test_client
    finally:
        main.app.dependency_overrides.pop(get_db, None)
        engine.dispose()


def trip():
    return {"pickup": {"latitude": 5.0377, "longitude": 8.322},
            "destination": {"latitude": 5.015, "longitude": 8.341}}


@pytest.mark.parametrize("key", ["pickup", "destination"])
def test_route_preview_and_quote_reject_outside_coverage(client, key):
    body = trip()
    body[key]["latitude"] = 6
    for path in ("route-previews", "quotes"):
        response = client.post(f"/api/v1/{path}", json={**body, "vehicle_class": "STANDARD"})
        assert response.status_code == 409
        assert response.json()["detail"].startswith(key.capitalize())


@pytest.mark.parametrize("key", ["pickup", "destination"])
def test_route_preview_rejects_invalid_coordinate(client, key):
    body = trip()
    body[key]["longitude"] = 181
    assert client.post("/api/v1/route-previews", json=body).status_code == 422


@pytest.mark.parametrize(("distance", "duration", "geometry"), [(0, 120, "????"), (200, 0, "????"), (200, 120, "")])
def test_missing_routing_data_rejects_previews_and_quotes(client, monkeypatch, distance, duration, geometry):
    route = RouteResult(distance_meters=distance, duration_seconds=duration, polyline=geometry)
    monkeypatch.setattr(main, "routing_adapter", lambda: MockRoutesAdapter(route))
    for path in ("route-previews", "quotes"):
        response = client.post(f"/api/v1/{path}", json={**trip(), "vehicle_class": "STANDARD"})
        assert response.status_code == 503
        assert "incomplete road data" in response.json()["detail"]


def test_preview_returns_provider_geometry_without_fuel_or_fare_rules(client, monkeypatch):
    route = RouteResult(distance_meters=4682, duration_seconds=555, polyline="_p~iF~ps|U_ulLnnqC")
    monkeypatch.setattr(main, "routing_adapter", lambda: MockRoutesAdapter(route))
    response = client.post("/api/v1/route-previews", json=trip())
    assert response.status_code == 200
    assert response.json() == route.model_dump()
