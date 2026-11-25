from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app.fuel import create_fresh_snapshot, review_observation, submit_observation
from app.models import FuelStation, PricingZone
from app.schemas import FuelSubmission


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    zone = PricingZone(id=1, city="Calabar", name="pilot")
    session.add(zone)
    session.add_all([
        FuelStation(id=1, name="A", address="Calabar", latitude=5, longitude=8, zone_id=1),
        FuelStation(id=2, name="B", address="Calabar", latitude=5, longitude=8, zone_id=1),
    ])
    session.commit()
    yield session
    session.close()


def observation(station_id, price, when=None, fuel_type="PMS"):
    return FuelSubmission(station_id=station_id, fuel_type=fuel_type, price=Decimal(price), source="admin",
                          evidence_reference=f"https://evidence/{station_id}/{price}", observed_at=when or datetime.now(timezone.utc))


def test_median_uses_distinct_approved_stations(db):
    a = submit_observation(db, observation(1, "200"), "collector")
    b = submit_observation(db, observation(2, "220"), "collector")
    review_observation(db, a.id, "APPROVED", "reviewer", independent=True)
    review_observation(db, b.id, "APPROVED", "reviewer", independent=True)
    snapshot = create_fresh_snapshot(db, 1, "PMS")
    assert snapshot.median_price == Decimal("210.00")
    assert snapshot.observation_count == 2


def test_unverified_and_stale_observations_are_rejected(db):
    submit_observation(db, observation(1, "200"), "collector")
    with pytest.raises(ValueError, match="insufficient"):
        create_fresh_snapshot(db, 1, "PMS")
    old = observation(2, "220", datetime.now(timezone.utc) - timedelta(hours=7))
    item = submit_observation(db, old, "collector")
    review_observation(db, item.id, "APPROVED", "reviewer")
    with pytest.raises(ValueError, match="insufficient"):
        create_fresh_snapshot(db, 1, "PMS")


def test_wrong_fuel_type_and_duplicate_submission(db):
    when = datetime.now(timezone.utc)
    submit_observation(db, observation(1, "200", when, fuel_type="AGO"), "collector")
    with pytest.raises(ValueError, match="duplicate"):
        submit_observation(db, observation(1, "200", when, fuel_type="AGO"), "collector")


def test_synthetic_observations_require_demo_mode(db, monkeypatch):
    monkeypatch.setattr("app.fuel.settings.demo_mode", False)
    item = observation(1, "200")
    item.is_demo = True
    with pytest.raises(ValueError, match="disabled outside demo mode"):
        submit_observation(db, item, "collector")
