"""Seed a separate, explicitly synthetic Calabar quote database.

Run only with ROUTENA_DEMO_MODE=true and a separate ROUTENA_DATABASE_URL.
The boundary is an illustrative test polygon, not an operating-area boundary.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
import secrets
from sqlalchemy import select
from app.config import settings
from app.db import SessionLocal
from app.driver_api import password_digest
from app.fuel import review_observation, submit_observation
from app.models import City, DriverAccount, DriverVehicle, FareRule, FuelObservation, FuelStation, NigerianState, PricingZone, ServiceZone
from app.schemas import FuelSubmission


ILLUSTRATIVE_BOUNDARY = {
    "type": "Polygon",
    "coordinates": [[[8.29, 4.98], [8.38, 4.98], [8.38, 5.08], [8.29, 5.08], [8.29, 4.98]]],
}


def seed():
    if not settings.demo_mode:
        raise RuntimeError("Set ROUTENA_DEMO_MODE=true to seed synthetic data")
    db = SessionLocal()
    try:
        state = db.scalar(select(NigerianState).where(NigerianState.code == "CR"))
        if not state:
            raise RuntimeError("Run Alembic migrations before seeding")
        city = db.scalar(select(City).where(City.name == "Calabar"))
        if not city:
            city = City(state_id=state.id, name="Calabar", timezone="Africa/Lagos", currency="NGN",
                        is_active=True, operating_status="ACTIVE")
            db.add(city)
            db.flush()
        else:
            city.is_active = True
            city.operating_status = "ACTIVE"
        zone = db.scalar(select(ServiceZone).where(ServiceZone.city_id == city.id, ServiceZone.name == "Calabar demo zone"))
        if not zone:
            zone = ServiceZone(city_id=city.id, name="Calabar demo zone",
                               boundary_geojson=json.dumps(ILLUSTRATIVE_BOUNDARY),
                               active=True)
            db.add(zone)
            db.flush()
        pricing = db.scalar(select(PricingZone).where(PricingZone.name == "Calabar pilot service area"))
        if not pricing:
            pricing = PricingZone(city="Calabar", name="Calabar pilot service area",
                                  service_area_reference="Illustrative development polygon only",
                                  city_id=city.id, service_zone_id=zone.id, active=True)
            db.add(pricing)
            db.flush()
        else:
            pricing.city_id, pricing.service_zone_id, pricing.active = city.id, zone.id, True
        # These are editable development assumptions, not validated market rates.
        vehicle_rules = {
            "STANDARD": ("500", "65", "35", "10"),
            "PREMIUM": ("700", "80", "40", "8"),
            "MOTORCYCLE": ("350", "40", "25", "35"),
        }
        for vehicle_class, (base, maintenance, time_rate, efficiency) in vehicle_rules.items():
            rule = db.scalar(select(FareRule).where(
                FareRule.city_id == city.id, FareRule.vehicle_class == vehicle_class,
            ))
            if not rule:
                rule = FareRule(city_id=city.id, vehicle_class=vehicle_class,
                                version=f"calabar-demo-{vehicle_class.lower()}-v1",
                                base_driver_allowance=Decimal(base),
                                maintenance_per_km=Decimal(maintenance),
                                time_allowance_per_minute=Decimal(time_rate),
                                fuel_efficiency_km_per_litre=Decimal(efficiency),
                                commission_rate=Decimal("0.08"),
                                rounding_increment=Decimal("50"), active=True,
                                minimum_driver_contribution_margin=Decimal("0"),
                                driver_earnings_target=Decimal("0"),
                                minimum_trip_fare=Decimal("0"))
                db.add(rule)
            else:
                rule.active = True
        stations = []
        for name, latitude, longitude in (
            ("DEMO Station Alpha", Decimal("5.030000"), Decimal("8.325000")),
            ("DEMO Station Beta", Decimal("5.045000"), Decimal("8.350000")),
        ):
            station = db.scalar(select(FuelStation).where(FuelStation.name == name))
            if not station:
                station = FuelStation(name=name, address="DEMO ONLY - illustrative station",
                                      latitude=latitude, longitude=longitude, zone_id=pricing.id, active=True)
                db.add(station)
                db.flush()
            stations.append(station)
        db.commit()
        now = datetime.now(timezone.utc)
        for station, price in zip(stations, (Decimal("1200"), Decimal("1240"))):
            latest = db.scalar(select(FuelObservation).where(
                FuelObservation.station_id == station.id,
                FuelObservation.is_demo.is_(True),
                FuelObservation.fuel_type == "PMS",
            ).order_by(FuelObservation.observed_at.desc()))
            freshness_cutoff = now - timedelta(hours=settings.fuel_freshness_hours)
            latest_observed_at = (
                latest.observed_at.replace(tzinfo=timezone.utc)
                if latest and latest.observed_at.tzinfo is None
                else latest.observed_at if latest else None
            )
            if not latest or latest_observed_at < freshness_cutoff:
                item = submit_observation(db, FuelSubmission(
                    station_id=station.id, fuel_type="PMS", price=price,
                    source="DEMO_SYNTHETIC", evidence_reference="DEMO_ONLY://no-live-evidence",
                    observed_at=now, is_demo=True), "demo-seed")
                review_observation(db, item.id, "APPROVED", "demo-seed",
                                   notes="DEMO ONLY; illustrative value, not a real fuel observation",
                                   independent=False)
        existing_driver = db.scalar(select(DriverAccount).where(DriverAccount.email == "driver@routena.test"))
        if not existing_driver:
            salt = secrets.token_bytes(16)
            digest = password_digest("DriverDemo2026!", salt)
            driver = DriverAccount(id=1, full_name="Emeka Okon", email="driver@routena.test",
                                   phone="+2348012345678", city_id=city.id,
                                   password_hash=f"{salt.hex()}${digest}",
                                   status="APPROVED", licence_placeholder="CAL-DRV-84920",
                                   vehicle_documents_ready=True)
            db.add(driver)
            db.flush()
            vehicle = DriverVehicle(driver_id=driver.id, vehicle_class="STANDARD",
                                    manufacturer="Toyota", model="Corolla", year=2021,
                                    colour="Silver", registration_number="CAL-742-CR",
                                    fuel_type="PMS", claimed_fuel_efficiency=Decimal("11.5"),
                                    status="APPROVED")
            db.add(vehicle)
            db.commit()
        print("Seeded separate demo database with illustrative Calabar data and approved driver.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
