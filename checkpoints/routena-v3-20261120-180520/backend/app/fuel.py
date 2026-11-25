from datetime import datetime, timedelta, timezone
from statistics import median
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import settings
from .models import FuelObservation, FuelPriceSnapshot, FuelStation, FuelVerification


def submit_observation(db: Session, data, actor: str) -> FuelObservation:
    if data.is_demo and not settings.demo_mode:
        raise ValueError("synthetic fuel observations are disabled outside demo mode")
    key = f"{data.station_id}:{data.fuel_type}:{data.observed_at.isoformat()}:{data.price}"
    if db.scalar(select(FuelObservation).where(FuelObservation.duplicate_key == key)):
        raise ValueError("duplicate fuel observation")
    station = db.get(FuelStation, data.station_id)
    if not station or not station.active:
        raise ValueError("fuel station is unavailable")
    item = FuelObservation(**data.model_dump(), submitted_by=actor, duplicate_key=key)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def review_observation(db: Session, observation_id: int, state: str, actor: str, notes=None, independent=False):
    observation = db.get(FuelObservation, observation_id)
    if not observation:
        raise ValueError("fuel observation not found")
    verification = db.scalar(select(FuelVerification).where(FuelVerification.observation_id == observation_id))
    now = datetime.now(timezone.utc)
    if not verification:
        verification = FuelVerification(observation_id=observation_id, verified_at=now, verified_by=actor,
                                        approval_state=state, notes=notes, independent=independent)
        db.add(verification)
    else:
        verification.verified_at, verification.verified_by = now, actor
        verification.approval_state, verification.notes, verification.independent = state, notes, independent
    db.commit()
    return verification


def create_fresh_snapshot(db: Session, zone_id: int, fuel_type: str) -> FuelPriceSnapshot:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.fuel_freshness_hours)
    rows = db.execute(
        select(FuelObservation, FuelStation, FuelVerification)
        .join(FuelStation, FuelStation.id == FuelObservation.station_id)
        .join(FuelVerification, FuelVerification.observation_id == FuelObservation.id)
        .where(FuelStation.zone_id == zone_id, FuelObservation.fuel_type == fuel_type,
               FuelVerification.approval_state == "APPROVED", FuelObservation.observed_at >= cutoff)
    ).all()
    by_station = {station.id: (observation, verification) for observation, station, verification in rows}
    if len(by_station) < settings.minimum_fuel_observations:
        raise ValueError("insufficient fresh verified fuel observations")
    values = [pair[0].price for pair in by_station.values()]
    now = datetime.now(timezone.utc)
    snapshot = FuelPriceSnapshot(zone_id=zone_id, fuel_type=fuel_type, median_price=median(values),
                                 observation_count=len(values), observed_through=max(x[0].observed_at for x in by_station.values()),
                                 created_at=now, freshness_expires_at=now + timedelta(hours=settings.fuel_freshness_hours))
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot
