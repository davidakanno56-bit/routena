"""Authenticated passenger and driver endpoints for local demo dispatch."""
import secrets
from collections import deque
from datetime import timezone
from decimal import Decimal
from threading import Lock
from time import time
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field, SecretStr
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from .config import settings
from .dispatch_models import Availability, OwnedQuote, Passenger, PassengerSession, Ride
from .dispatch_service import (
    ACTIVE, ADVANCE, ASSIGNED, SEARCHING, approved_vehicle, eligible, lock_dispatch,
    move, pickup_margin, proximity_meters, refresh, release_offer, valid_availability, zone_at,
)
from .driver_api import ActiveSession, Credential, Database, DemoInput, SESSION_SECONDS, password_digest, token_digest
from .models import DriverAccount, DriverVehicle, Quote, RouteSnapshot, ServiceZone
from .schemas import Coordinates

_buckets: dict[tuple[str, str], deque] = {}
_rate_lock = Lock()
_pin_security: dict[str, dict] = {}


def rate_limit(scope: str, key: str, limit: int):
    now = time()
    with _rate_lock:
        for bucket_key in list(_buckets):
            if _buckets[bucket_key][-1] <= now - 60:
                del _buckets[bucket_key]
        bucket_key = (scope, key)
        if bucket_key not in _buckets and len(_buckets) >= 4096:
            raise HTTPException(429, "The demo is busy. Try again in a minute.")
        bucket = _buckets.setdefault(bucket_key, deque())
        while bucket and bucket[0] <= now - 60:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(429, "Too many demo requests. Try again in a minute.")
        bucket.append(now)


def demo_dispatch(response: Response):
    if not (settings.demo_mode and settings.driver_onboarding_demo and settings.dispatch_demo):
        raise HTTPException(404, "Demo dispatch is unavailable.")
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(prefix="/api/v1/dispatch", dependencies=[Depends(demo_dispatch)], tags=["Local demo dispatch"])


class Login(DemoInput):
    email: str = Field(max_length=254, pattern=r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[Tt][Ee][Ss][Tt]$")
    password: SecretStr


class Register(Login):
    demo_acknowledged: Literal[True]


class NewRide(DemoInput):
    quote_id: UUID
    pickup: Coordinates
    destination: Coordinates
    vehicle_class: str


class AvailabilityInput(DemoInput):
    online: bool
    location: str | None = Field(default=None, max_length=100)
    synthetic_location_consent: bool = False


class DriverAction(DemoInput):
    action: Literal["accept", "decline", "advance"]
    expected_status: Literal["OFFERED", "ACCEPTED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS"]
    escrow_pin: str | None = Field(default=None, max_length=6)


def passenger_unauthorized():
    return HTTPException(401, "Sign in as a demo passenger.", headers={"WWW-Authenticate": "Bearer"})


def passenger_session(db: Database, credential: Credential):
    if not credential or len(credential.credentials) != 43:
        raise passenger_unauthorized()
    session = db.get(PassengerSession, token_digest(credential.credentials))
    if not session or session.expires_at <= int(time()):
        raise passenger_unauthorized()
    return session


PassengerIdentity = Annotated[PassengerSession, Depends(passenger_session)]


@router.get("/config")
def config():
    return {"demo_only": True, "availability_seconds": settings.dispatch_freshness_seconds}


@router.post("/passengers/register", status_code=201)
def register(data: Register, request: Request, db: Database):
    rate_limit("register", request.client.host if request.client else "local", 10)
    password = data.password.get_secret_value()
    if not 12 <= len(password) <= 128:
        raise HTTPException(422, "Use a password with 12 to 128 characters.")
    salt = secrets.token_bytes(16)
    db.add(Passenger(email=data.email.lower(), password_hash=f"{salt.hex()}${password_digest(password, salt)}"))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "That demo account already exists.") from exc
    return {"demo_only": True}


@router.post("/passengers/login")
def login(data: Login, request: Request, db: Database):
    rate_limit("login", request.client.host if request.client else "local", 20)
    password = data.password.get_secret_value()
    if len(password) > 128:
        raise passenger_unauthorized()
    account = db.scalar(select(Passenger).where(Passenger.email == data.email.lower()))
    salt, expected = account.password_hash.split("$") if account else ("0" * 32, "0" * 64)
    if not secrets.compare_digest(password_digest(password, bytes.fromhex(salt)), expected) or not account:
        raise passenger_unauthorized()
    token = secrets.token_urlsafe(32)
    now = int(time())
    db.execute(delete(PassengerSession).where(PassengerSession.passenger_id == account.id, PassengerSession.expires_at <= now))
    db.add(PassengerSession(token_hash=token_digest(token), passenger_id=account.id, expires_at=now + SESSION_SECONDS))
    db.commit()
    return {"access_token": token, "expires_in": SESSION_SECONDS, "demo_only": True}


@router.post("/passengers/quick-session")
def quick_session(request: Request, db: Database):
    rate_limit("quick_session", request.client.host if request.client else "local", 30)
    email = "rider@routena.test"
    account = db.scalar(select(Passenger).where(Passenger.email == email))
    if not account:
        salt = secrets.token_bytes(16)
        account = Passenger(email=email, password_hash=f"{salt.hex()}${password_digest('PassengerDemo123!', salt)}")
        db.add(account)
        db.flush()
    token = secrets.token_urlsafe(32)
    now = int(time())
    db.add(PassengerSession(token_hash=token_digest(token), passenger_id=account.id, expires_at=now + SESSION_SECONDS))
    db.commit()
    return {"access_token": token, "expires_in": SESSION_SECONDS, "passenger_id": account.id, "email": email, "demo_only": True}


@router.post("/passengers/logout", status_code=204)
def logout(db: Database, session: PassengerIdentity):
    db.delete(session)
    db.commit()
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


def ride_view(db: Database, ride: Ride | None, *, driver=False):
    if ride is None:
        return None
    quote = db.get(Quote, ride.quote_id)
    route = db.get(RouteSnapshot, quote.route_snapshot_id)
    fare_val = quote.breakdown.get("total") or quote.breakdown.get("final_passenger_fare")
    driver_share_val = quote.breakdown.get("driver_gross_share") or quote.breakdown.get("driver_gross_earnings")
    platform_fee_val = quote.breakdown.get("commission") or quote.breakdown.get("platform_commission")
    payload = {
        "id": ride.id, "status": ride.status, "quote_id": quote.id, "vehicle_class": quote.vehicle_class,
        "pickup": route.origin, "destination": route.destination, "route": {
            "distance_meters": route.distance_meters, "duration_seconds": route.duration_seconds, "polyline": route.polyline,
        },
        "fare_ngn": fare_val,
        "escrow_amount_ngn": ride.escrow_amount or fare_val,
        "platform_fee_ngn": ride.platform_fee or platform_fee_val,
        "driver_payout_ngn": ride.driver_payout or driver_share_val,
        "payout_status": ride.payout_status or "HELD_IN_ESCROW",
        "offer_until": ride.offer_until if driver else None,
        "updated_at": ride.updated_at, "demo_only": True, "driver": None,
    }
    if not driver:
        # Secure 6-digit code for passenger to release upon safe arrival
        payload["escrow_pin"] = ride.escrow_pin
    else:
        # Driver only sees the pin once validated/completed
        payload["escrow_pin"] = ride.escrow_pin if ride.status == "COMPLETED_DEMO" else None
        payload["driver_gross_ngn"] = ride.driver_payout or driver_share_val
        payload["driver_margin_ngn"] = str(pickup_margin(quote, ride.pickup_proximity_meters or 0))
        payload["pickup_proximity_meters"] = ride.pickup_proximity_meters

    if not driver and ride.driver_id is not None and ride.status in ASSIGNED | {"COMPLETED_DEMO"}:
        account = db.get(DriverAccount, ride.driver_id)
        vehicle = db.get(DriverVehicle, ride.driver_id)
        payload["driver"] = {
            "name": account.full_name if account else "Verified Routena Driver",
            "vehicle": f"{vehicle.manufacturer} {vehicle.model}" if vehicle else "Standard Sedan",
            "colour": vehicle.colour if vehicle else "White",
            "plate": getattr(vehicle, "licence_plate", "CAL-882-CR")
        }
    return payload


def latest(db: Database, field, key):
    return db.scalar(select(Ride).where(field == key).order_by(Ride.status.in_(ACTIVE).desc(), Ride.updated_at.desc(), Ride.id).limit(1))


@router.post("/rides", status_code=201)
def request_ride(data: NewRide, db: Database, session: PassengerIdentity):
    rate_limit("ride", str(session.passenger_id), 8)
    lock_dispatch(db)
    now = int(time())
    ownership = db.get(OwnedQuote, str(data.quote_id))
    quote = db.get(Quote, str(data.quote_id))
    if not quote:
        raise HTTPException(404, "Demo quote not found.")
    if not ownership:
        ownership = OwnedQuote(quote_id=quote.id, passenger_id=session.passenger_id)
        db.add(ownership)
        db.flush()
    elif ownership.passenger_id != session.passenger_id:
        raise HTTPException(403, "This quote belongs to another session.")
    if quote.expires_at.replace(tzinfo=timezone.utc).timestamp() <= now:
        raise HTTPException(409, "The quote expired. Request a new estimate.")
    route = db.get(RouteSnapshot, quote.route_snapshot_id)
    if not quote.breakdown.get("demo_only") or not route:
        raise HTTPException(409, "A current dispatch demo quote is required.")
    if (route.origin != data.pickup.model_dump() or route.destination != data.destination.model_dump()
            or quote.vehicle_class != data.vehicle_class or data.vehicle_class not in settings.allowed_vehicle_classes):
        raise HTTPException(409, "The route or vehicle differs from the quote.")
    _, zone, _ = zone_at(db, route.origin)
    zone_at(db, route.destination)
    refresh(db, now)
    if db.scalar(select(Ride.id).where(Ride.quote_id == quote.id)):
        raise HTTPException(409, "This quote already has a ride request.")
    if db.scalar(select(Ride.id).where(Ride.passenger_id == session.passenger_id, Ride.status.in_(ACTIVE))):
        raise HTTPException(409, "Finish or cancel your active demo ride first.")

    breakdown = quote.breakdown
    total_fare = str(breakdown.get("total") or breakdown.get("final_passenger_fare") or "0")
    comm = str(breakdown.get("commission") or breakdown.get("platform_commission") or "0")
    driver_share = str(breakdown.get("driver_gross_share") or breakdown.get("driver_gross_earnings") or "0")
    six_digit_pin = f"{secrets.randbelow(900000) + 100000}"

    ride = Ride(
        id=str(uuid4()),
        passenger_id=session.passenger_id,
        quote_id=quote.id,
        zone_id=zone.id,
        deadline=now + settings.dispatch_search_seconds,
        status="REQUESTED",
        attempted=[],
        escrow_pin=six_digit_pin,
        escrow_amount=total_fare,
        platform_fee=comm,
        driver_payout=driver_share,
        payout_status="HELD_IN_ESCROW",
        created_at=now,
        updated_at=now
    )
    db.add(ride)
    move(db, ride, "REQUESTED", "passenger", now)
    move(db, ride, "SEARCHING", "dispatch", now)
    db.flush()
    refresh(db, now)
    result = ride_view(db, ride)
    db.commit()
    return result


@router.post("/rides/current")
def current_ride(db: Database, session: PassengerIdentity):
    lock_dispatch(db)
    refresh(db, int(time()))
    result = ride_view(db, latest(db, Ride.passenger_id, session.passenger_id))
    db.commit()
    return result


@router.post("/rides/{ride_id}/cancel")
def cancel(ride_id: UUID, db: Database, session: PassengerIdentity):
    lock_dispatch(db)
    ride = db.get(Ride, str(ride_id))
    if not ride or ride.passenger_id != session.passenger_id:
        raise HTTPException(404, "Demo ride not found.")
    now = int(time())
    refresh(db, now)
    if ride.status not in SEARCHING | (ASSIGNED - {"IN_PROGRESS"}):
        raise HTTPException(409, "This ride can no longer be cancelled.")
    move(db, ride, "CANCELLED", "passenger", now)
    ride.offer_until = None
    result = ride_view(db, ride)
    db.commit()
    return result


def driver_view(db: Database, driver_id: int, now: int):
    driver = db.get(DriverAccount, driver_id)
    qualifying = approved_vehicle(db, driver_id)
    availability = db.get(Availability, driver_id)
    if availability and (not qualifying or not valid_availability(db, availability, now)):
        availability = None
    locations = []
    if qualifying:
        for name, pair in settings.dispatch_demo_locations.items():
            try:
                city, _, _ = zone_at(db, {"latitude": pair[0], "longitude": pair[1]})
                if city.id == driver.city_id:
                    locations.append(name)
            except HTTPException:
                pass
    completed_rides = db.scalars(select(Ride).where(Ride.driver_id == driver_id, Ride.status == "COMPLETED_DEMO")).all()
    wallet_balance = sum((Decimal(r.driver_payout or 0) for r in completed_rides), Decimal(0))
    return {
        "demo_only": True, "eligible": bool(qualifying), "online": bool(availability),
        "locations": locations, "last_seen": availability.last_seen if availability else None,
        "expires_at": availability.last_seen + settings.dispatch_freshness_seconds if availability else None,
        "service_area": db.get(ServiceZone, availability.zone_id).name if availability else None,
        "ride": ride_view(db, latest(db, Ride.driver_id, driver_id), driver=True) if qualifying else None,
        "wallet_balance_ngn": str(wallet_balance),
        "completed_trips_count": len(completed_rides),
    }


@router.post("/driver/status")
def driver_status(db: Database, session: ActiveSession):
    lock_dispatch(db)
    now = int(time())
    refresh(db, now)
    db.flush()
    result = driver_view(db, session.driver_id, now)
    db.commit()
    return result


@router.put("/driver/availability")
def set_availability(data: AvailabilityInput, db: Database, session: ActiveSession):
    lock_dispatch(db)
    now = int(time())
    current = db.get(Availability, session.driver_id)
    if data.online:
        if not data.synthetic_location_consent or data.location not in settings.dispatch_demo_locations:
            raise HTTPException(422, "Choose and consent to a synthetic location.")
        approved = approved_vehicle(db, session.driver_id)
        if not approved:
            raise HTTPException(403, "An approved driver and vehicle are required.")
        latitude, longitude = settings.dispatch_demo_locations[data.location]
        city, zone, _ = zone_at(db, {"latitude": latitude, "longitude": longitude})
        if approved[0].city_id != city.id:
            raise HTTPException(409, "This synthetic location is outside your approved operating city.")
        if not current:
            current = Availability(driver_id=session.driver_id)
            db.add(current)
        current.latitude, current.longitude, current.zone_id = latitude, longitude, zone.id
        current.last_seen, current.session_hash = now, session.token_hash
    elif current:
        db.delete(current)
    db.flush()
    refresh(db, now)
    db.flush()
    result = driver_view(db, session.driver_id, now)
    db.commit()
    return result


@router.post("/driver/rides/{ride_id}/action")
def driver_action(ride_id: UUID, data: DriverAction, db: Database, session: ActiveSession):
    lock_dispatch(db)
    ride = db.get(Ride, str(ride_id))
    if not ride or ride.driver_id != session.driver_id:
        raise HTTPException(404, "Demo ride not found.")
    now = int(time())
    refresh(db, now)
    if not approved_vehicle(db, session.driver_id):
        raise HTTPException(403, "An approved driver and vehicle are required.")
    if ride.driver_id != session.driver_id or data.expected_status != ride.status:
        raise HTTPException(409, "This offer or trip status has changed.")
    if data.action in {"accept", "decline"} and ride.status == "OFFERED":
        if data.action == "decline":
            release_offer(db, ride, now, "driver:declined")
            refresh(db, now)
        else:
            quote = db.get(Quote, ride.quote_id)
            position = eligible(db, ride, quote, session.driver_id, now)
            if not position:
                raise HTTPException(409, "The demo offer is no longer available.")
            route = db.get(RouteSnapshot, quote.route_snapshot_id)
            distance = proximity_meters(position, route.origin)
            if distance > settings.dispatch_max_pickup_meters or pickup_margin(quote, distance) < Decimal(quote.breakdown["minimum_driver_contribution_margin"]):
                raise HTTPException(409, "Your demo location is no longer eligible for this offer.")
            ride.pickup_proximity_meters = distance
            ride.offer_until = None
            move(db, ride, "ACCEPTED", "driver", now)
    elif data.action == "advance" and ride.status in ADVANCE:
        if ride.status == "IN_PROGRESS":
            sec = _pin_security.setdefault(ride.id, {"attempts": 0, "locked_until": 0})
            if now < sec["locked_until"]:
                wait_sec = sec["locked_until"] - now
                raise HTTPException(403, f"Security Lockout: 3 incorrect attempts. Please wait {wait_sec} seconds before trying again.")
            expected_pin = (ride.escrow_pin or "").strip()
            provided_pin = (data.escrow_pin or "").strip()
            if not provided_pin or provided_pin != expected_pin:
                sec["attempts"] += 1
                if sec["attempts"] >= 3:
                    sec["locked_until"] = now + 300
                    raise HTTPException(403, "Security Lockout: 3 incorrect attempts. Trip completion is locked for 5 minutes.")
                remaining = 3 - sec["attempts"]
                raise HTTPException(400, f"Invalid 6-digit PIN. {remaining} attempt{'s' if remaining != 1 else ''} remaining before a 5-minute security lockout.")
            _pin_security.pop(ride.id, None)
            ride.payout_status = "PAID_TO_DRIVER"
        move(db, ride, ADVANCE[ride.status], "driver", now)
    else:
        raise HTTPException(409, "This trip transition is unavailable.")
    db.flush()
    result = driver_view(db, session.driver_id, now)
    db.commit()
    return result
