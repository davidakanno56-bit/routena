"""Server-authoritative matching for the isolated demonstration."""
from datetime import datetime, timezone
from decimal import Decimal
from math import asin, cos, radians, sin, sqrt

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .config import settings
from .dispatch_models import Availability, DispatchLock, Ride
from .models import AuditEvent, DriverAccount, DriverSession, DriverVehicle, Quote, RouteSnapshot
from .service_area import resolve_service_area

SEARCHING = {"REQUESTED", "SEARCHING", "OFFERED"}
ASSIGNED = {"ACCEPTED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS"}
ACTIVE = SEARCHING | ASSIGNED
ADVANCE = {
    "ACCEPTED": "DRIVER_ARRIVING", "DRIVER_ARRIVING": "DRIVER_ARRIVED",
    "DRIVER_ARRIVED": "IN_PROGRESS", "IN_PROGRESS": "COMPLETED_DEMO",
}


def lock_dispatch(db: Session):
    # All ride and availability writes serialize on a single migrated row. SQLite
    # also acquires its writer lock here, before any ride state is read.
    result = db.execute(update(DispatchLock).where(DispatchLock.id == 1)
                        .values(revision=DispatchLock.revision + 1))
    if result.rowcount != 1:
        raise HTTPException(503, "Apply the demo dispatch database migration.")


def move(db: Session, ride: Ride, status: str, actor: str, now: int):
    db.add(AuditEvent(actor=actor, action="DEMO_RIDE_" + status, entity_type="demo_ride",
                      entity_id=ride.id, details={"from": ride.status, "driver_id": ride.driver_id},
                      created_at=datetime.fromtimestamp(now, timezone.utc)))
    ride.status = status
    ride.updated_at = now


def zone_at(db: Session, point: dict):
    try:
        return resolve_service_area(db, point["latitude"], point["longitude"])
    except ValueError as exc:
        raise HTTPException(409, "The location is outside active demo coverage.") from exc


def approved_vehicle(db: Session, driver_id: int):
    driver = db.get(DriverAccount, driver_id, populate_existing=True, with_for_update=True)
    vehicle = db.get(DriverVehicle, driver_id, populate_existing=True, with_for_update=True)
    if driver and driver.status == "APPROVED" and vehicle and vehicle.status == "APPROVED":
        if vehicle.vehicle_class in settings.allowed_vehicle_classes:
            return driver, vehicle
    return None


def valid_availability(db: Session, availability: Availability, now: int):
    session = db.get(DriverSession, availability.session_hash)
    return bool(session and session.expires_at > now and availability.last_seen + settings.dispatch_freshness_seconds > now)


def eligible(db: Session, ride: Ride, quote: Quote, driver_id: int, now: int):
    approved = approved_vehicle(db, driver_id)
    availability = db.get(Availability, driver_id)
    if not approved or not availability or not valid_availability(db, availability, now):
        return None
    driver, vehicle = approved
    if vehicle.vehicle_class != quote.vehicle_class or availability.zone_id != ride.zone_id:
        return None
    route = db.get(RouteSnapshot, quote.route_snapshot_id)
    try:
        pickup_city, pickup_zone, _ = zone_at(db, route.origin)
        driver_city, driver_zone, _ = zone_at(db, {
            "latitude": availability.latitude, "longitude": availability.longitude,
        })
        zone_at(db, route.destination)
    except HTTPException:
        return None
    if pickup_zone.id != ride.zone_id or driver_zone.id != ride.zone_id or driver_city.id != pickup_city.id or driver.city_id != driver_city.id:
        return None
    return availability


def proximity_meters(location: Availability, origin: dict):
    delta_lat = radians(origin["latitude"] - location.latitude)
    delta_lng = radians(origin["longitude"] - location.longitude)
    score = sin(delta_lat / 2) ** 2 + cos(radians(origin["latitude"])) * cos(radians(location.latitude)) * sin(delta_lng / 2) ** 2
    return round(12_742_000 * asin(sqrt(min(1.0, score))))


def pickup_margin(quote: Quote, distance: int):
    fare = quote.breakdown
    projected_km = Decimal(distance) * settings.dispatch_pickup_road_factor / 1000
    extra_km = max(Decimal(0), projected_km - Decimal(fare["pickup_distance_km"]))
    return Decimal(fare["driver_contribution_margin"]) - extra_km * Decimal(fare["dispatch_operating_cost_per_km"])


def match(db: Session, ride: Ride, quote: Quote, now: int):
    route = db.get(RouteSnapshot, quote.route_snapshot_id)
    reserved = select(Ride.driver_id).where(Ride.status.in_(ASSIGNED | {"OFFERED"}), Ride.driver_id.is_not(None))
    candidates = db.scalars(select(Availability).where(
        Availability.zone_id == ride.zone_id, Availability.last_seen > now - settings.dispatch_freshness_seconds,
        Availability.driver_id.not_in(reserved), Availability.driver_id.not_in(ride.attempted),
    ))
    ranked = sorted((proximity_meters(item, route.origin), item.driver_id) for item in candidates)
    for distance, driver_id in ranked:
        if distance > settings.dispatch_max_pickup_meters:
            break
        if pickup_margin(quote, distance) < Decimal(quote.breakdown["minimum_driver_contribution_margin"]):
            continue
        if eligible(db, ride, quote, driver_id, now):
            ride.driver_id = driver_id
            ride.offer_until = min(ride.deadline, now + settings.dispatch_offer_seconds)
            ride.pickup_proximity_meters = distance
            ride.attempted = [*ride.attempted, driver_id]
            move(db, ride, "OFFERED", "dispatch", now)
            db.flush()
            return


def release_offer(db: Session, ride: Ride, now: int, actor: str):
    move(db, ride, "SEARCHING", actor, now)
    ride.driver_id = None
    ride.offer_until = None
    ride.pickup_proximity_meters = None
    db.flush()


def refresh(db: Session, now: int):
    session_exists = select(DriverSession.token_hash).where(DriverSession.expires_at > now)
    db.execute(delete(Availability).where(
        (Availability.last_seen <= now - settings.dispatch_freshness_seconds) | Availability.session_hash.not_in(session_exists)
    ))
    for ride in db.scalars(select(Ride).where(Ride.status.in_(ACTIVE)).order_by(Ride.created_at, Ride.id)):
        if ride.status in ASSIGNED:
            if not approved_vehicle(db, ride.driver_id):
                move(db, ride, "CANCELLED", "dispatch:approval_lost", now)
                db.flush()
            continue
        quote = db.get(Quote, ride.quote_id)
        if ride.status == "OFFERED" and (ride.offer_until <= now or not eligible(db, ride, quote, ride.driver_id, now)):
            release_offer(db, ride, now, "dispatch:offer_released")
        if ride.status in {"REQUESTED", "SEARCHING"}:
            if now >= ride.deadline:
                move(db, ride, "EXPIRED" if ride.attempted else "NO_DRIVER_AVAILABLE", "dispatch:timeout", now)
                db.flush()
            else:
                match(db, ride, quote, now)
