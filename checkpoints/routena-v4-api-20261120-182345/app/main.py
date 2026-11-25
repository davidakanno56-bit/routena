from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_CEILING
import uuid
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import settings
from .db import Base, engine, get_db
from .fuel import create_fresh_snapshot, review_observation, submit_observation
from .models import City, Quote, RouteSnapshot
from .models import FareRule
from .fare import calculate_fare
from .routes import routing_adapter
from .service_area import resolve_service_area
from .schemas import FuelSubmission, PricingSimulationRequest, QuoteRequest, ReviewRequest, RouteRequest, RouteResult

Base.metadata.create_all(engine)
app = FastAPI(title="Routena Nationwide API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://localhost:5174"], allow_methods=["*"],
                   allow_headers=["*"], allow_credentials=True)


@app.get("/health")
def health():
    return {"status": "ok", "service": "routena-api"}


def admin(authorization: str | None = Header(default=None)):
    if authorization == settings.admin_token:
        return "admin"
    if authorization != f"Bearer {settings.admin_token}":
        raise HTTPException(401, "admin authentication required")
    return "admin"


@app.post("/api/v1/admin/fuel-observations", status_code=201)
def submit_fuel(data: FuelSubmission, db: Session = Depends(get_db), actor: str = Depends(admin)):
    try:
        return submit_observation(db, data, actor)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@app.post("/api/v1/admin/fuel-observations/{observation_id}/{action}")
def verify_fuel(observation_id: int, action: str, request: ReviewRequest, db: Session = Depends(get_db), actor: str = Depends(admin)):
    if action not in {"approve", "reject"}:
        raise HTTPException(400, "action must be approve or reject")
    try:
        return review_observation(db, observation_id, "APPROVED" if action == "approve" else "REJECTED",
                                  actor, request.notes, request.independent)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.patch("/api/v1/admin/cities/{city_id}")
def set_city_status(city_id: int, active: bool, db: Session = Depends(get_db), actor: str = Depends(admin)):
    city = db.get(City, city_id)
    if not city:
        raise HTTPException(404, "city not found")
    city.is_active = active
    city.operating_status = "ACTIVE" if active else "INACTIVE"
    db.commit()
    return {"city_id": city.id, "active": city.is_active, "operating_status": city.operating_status}


@app.post("/api/v1/admin/pricing-simulations")
def pricing_simulation(
    request: PricingSimulationRequest,
    actor: str = Depends(admin),
):
    """Run hypothetical pricing without reading or mutating stored pricing rules."""
    rule = FareRule(
        city_id=0,
        vehicle_class=request.vehicle_class,
        version=f"simulation-{request.city.lower().replace(' ', '-')}",
        base_driver_allowance=request.base_driver_allowance,
        maintenance_per_km=request.maintenance_per_km,
        time_allowance_per_minute=request.time_allowance_per_minute,
        fuel_efficiency_km_per_litre=request.fuel_efficiency_km_per_litre,
        commission_rate=request.commission_rate,
        rounding_increment=request.rounding_increment,
        pickup_distance_km=request.pickup_distance_km,
        pickup_time_minutes=request.pickup_time_minutes,
        traffic_delay_minutes=request.traffic_delay_minutes,
        operating_overhead_per_km=request.operating_overhead_per_km,
        minimum_driver_contribution_margin=request.minimum_driver_contribution_margin,
        driver_earnings_target=Decimal("0"),
        minimum_trip_fare=request.minimum_trip_fare,
        pickup_allowance=request.pickup_allowance,
        tolls=request.tolls,
        payment_costs=request.payment_costs,
        applicable_taxes=request.applicable_taxes,
    )
    try:
        fare = calculate_fare(
            int(request.distance_km * Decimal("1000")),
            int(request.duration_minutes * Decimal("60")),
            request.fuel_price_per_litre,
            rule,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {
        "hypothetical": True,
        "label": "HYPOTHETICAL SIMULATION — NOT A LIVE QUOTE",
        "city": request.city,
        "vehicle_class": request.vehicle_class,
        "fare_breakdown": {key: str(value) for key, value in fare.items()},
    }


def validated_service_area(request: RouteRequest, db: Session):
    if request.pickup == request.destination:
        raise HTTPException(422, "Choose different pickup and destination points.")
    areas = []
    for label, coordinates in (("Pickup", request.pickup), ("Destination", request.destination)):
        try:
            areas.append(resolve_service_area(db, coordinates.latitude, coordinates.longitude))
        except ValueError as exc:
            raise HTTPException(409, f"{label} is outside an activated service area.") from exc
    return areas[0]


async def road_route(request: RouteRequest) -> RouteResult:
    try:
        route = await routing_adapter().route(request.pickup.model_dump(), request.destination.model_dump())
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(503, "Road routing is currently unavailable.") from exc
    if route.distance_meters <= 0 or route.duration_seconds <= 0 or not route.polyline.strip():
        raise HTTPException(503, "The routing provider returned incomplete road data.")
    return route


@app.post("/api/v1/route-previews", response_model=RouteResult)
async def route_preview(request: RouteRequest, db: Session = Depends(get_db)):
    validated_service_area(request, db)
    return await road_route(request)


@app.post("/api/v1/quotes")
async def quote(request: QuoteRequest, db: Session = Depends(get_db)):
    if request.vehicle_class not in settings.allowed_vehicle_classes:
        raise HTTPException(422, "vehicle class is not allowed")
    city, service_zone, pricing_zone = validated_service_area(request, db)
    route = await road_route(request)
    try:
        fuel = create_fresh_snapshot(db, pricing_zone.id, "PMS")
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    rule = db.scalar(select(FareRule).where(
        FareRule.city_id == city.id, FareRule.active.is_(True),
        FareRule.vehicle_class == request.vehicle_class,
    ))
    if not rule:
        rule = db.scalar(select(FareRule).where(
            FareRule.city_id == city.id, FareRule.active.is_(True),
            FareRule.vehicle_class.is_(None),
        ))
    if not rule:
        raise HTTPException(503, "no active fare rules are configured for this city")
    try:
        fare = calculate_fare(route.distance_meters, route.duration_seconds, Decimal(fuel.median_price), rule)
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    now = datetime.now(timezone.utc)
    route_snapshot = RouteSnapshot(provider=settings.routing_provider, origin=request.pickup.model_dump(),
                                   destination=request.destination.model_dump(), distance_meters=route.distance_meters,
                                   duration_seconds=route.duration_seconds, polyline=route.polyline, created_at=now)
    db.add(route_snapshot)
    db.flush()
    quote_id = str(uuid.uuid4())
    breakdown = {"road_distance_km": str(fare["road_distance_km"]),
                 "estimated_duration_minutes": str(fare["estimated_duration_minutes"]),
                 "estimated_fuel_consumption_litres": str(fare["estimated_fuel_consumption_litres"]),
                 "fuel_efficiency_km_per_litre": str(rule.fuel_efficiency_km_per_litre),
                 "base_driver_allowance": str(fare["base_driver_allowance"]), "maintenance": str(fare["maintenance_allowance"]),
                 "time_allowance": str(fare["time_allowance"]), "fuel": str(fare["fuel_cost"]),
                 "pickup_distance_km": str(fare["pickup_distance_km"]),
                 "pickup_time_minutes": str(fare["pickup_time_minutes"]),
                 "traffic_delay_minutes": str(fare["traffic_delay_minutes"]),
                 "operating_overhead": str(fare["operating_overhead"]),
                 "modeled_operating_costs": str(fare["modeled_operating_costs"]),
                 "driver_contribution_margin": str(fare["driver_contribution_margin"]),
                 "minimum_driver_contribution_margin": str(fare["minimum_driver_contribution_margin"]),
                 "driver_earnings_target": str(fare["driver_earnings_target"]),
                 "minimum_trip_fare": str(fare["minimum_trip_fare"]),
                 "pickup_allowance": str(fare["pickup_allowance"]), "tolls": str(fare["tolls"]),
                 "payment_costs": str(fare["payment_costs"]), "applicable_taxes": str(fare["applicable_taxes"]),
                 "driver_minimum_earnings": str(settings.driver_minimum_earnings),
                 "subtotal": str(fare["driver_gross_earnings"]), "commission": str(fare["platform_commission"]),
                 "commission_base": str(fare["commission_base"]),
                 "total": str(fare["final_passenger_fare"]), "driver_gross_share": str(fare["driver_gross_earnings"]),
                 "fuel_price": str(fuel.median_price), "fuel_source": "verified_observation_snapshot",
                 "currency": city.currency, "rules_version": fare["rules_version"],
                 "demo_only": settings.demo_mode, "demo_label": "DEMO - NOT A LIVE FARE" if settings.demo_mode else None}
    db.add(Quote(id=quote_id, route_snapshot_id=route_snapshot.id, fuel_snapshot_id=fuel.id,
                 vehicle_class=request.vehicle_class, breakdown=breakdown, rules_version=str(fare["rules_version"]),
                 expires_at=now + timedelta(minutes=settings.quote_expiry_minutes), created_at=now))
    db.commit()
    return {"quote_id": quote_id, "expires_at": now + timedelta(minutes=settings.quote_expiry_minutes),
            "city": city.name, "service_zone": service_zone.name,
            "route": {"distance_meters": route.distance_meters, "duration_seconds": route.duration_seconds, "polyline": route.polyline},
            "fuel": {"price_ngn_per_litre": fuel.median_price, "observed_through": fuel.observed_through},
            "fare_breakdown": breakdown, "demo_only": settings.demo_mode,
            "label": "DEMO - NOT A LIVE FARE" if settings.demo_mode else "LIVE QUOTE"}
