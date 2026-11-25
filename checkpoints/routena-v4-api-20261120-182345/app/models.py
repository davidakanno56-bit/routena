from datetime import datetime
from decimal import Decimal
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class NigerianState(Base):
    __tablename__ = "nigerian_states"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    code: Mapped[str] = mapped_column(String(3), unique=True)


class City(Base):
    __tablename__ = "cities"
    id: Mapped[int] = mapped_column(primary_key=True)
    state_id: Mapped[int] = mapped_column(ForeignKey("nigerian_states.id"))
    name: Mapped[str] = mapped_column(String(100))
    timezone: Mapped[str] = mapped_column(String(80), default="Africa/Lagos")
    currency: Mapped[str] = mapped_column(String(3), default="NGN")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    operating_status: Mapped[str] = mapped_column(String(20), default="INACTIVE")


class ServiceZone(Base):
    __tablename__ = "service_zones"
    id: Mapped[int] = mapped_column(primary_key=True)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"))
    name: Mapped[str] = mapped_column(String(100))
    boundary_geojson: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=False)


class FareRule(Base):
    __tablename__ = "fare_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"))
    version: Mapped[str] = mapped_column(String(50))
    base_driver_allowance: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    maintenance_per_km: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    time_allowance_per_minute: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    fuel_efficiency_km_per_litre: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    commission_rate: Mapped[Decimal] = mapped_column(Numeric(8, 5))
    rounding_increment: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    vehicle_class: Mapped[str | None] = mapped_column(String(30), nullable=True)
    pickup_distance_km: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    pickup_time_minutes: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    traffic_delay_minutes: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    operating_overhead_per_km: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    minimum_driver_contribution_margin: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    driver_earnings_target: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    minimum_trip_fare: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    pickup_allowance: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    tolls: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    payment_costs: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    applicable_taxes: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)


class FuelStation(Base):
    __tablename__ = "fuel_stations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(500))
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("pricing_zones.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PricingZone(Base):
    __tablename__ = "pricing_zones"
    id: Mapped[int] = mapped_column(primary_key=True)
    city: Mapped[str] = mapped_column(String(100), default="Calabar")
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    service_zone_id: Mapped[int | None] = mapped_column(ForeignKey("service_zones.id"))
    name: Mapped[str] = mapped_column(String(100))
    service_area_reference: Mapped[str | None] = mapped_column(String(500))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class FuelObservation(Base):
    __tablename__ = "fuel_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("fuel_stations.id"))
    fuel_type: Mapped[str] = mapped_column(String(20))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    source: Mapped[str] = mapped_column(String(100))
    evidence_reference: Mapped[str] = mapped_column(String(1000))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_by: Mapped[str] = mapped_column(String(200))
    duplicate_key: Mapped[str] = mapped_column(String(500), unique=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class FuelVerification(Base):
    __tablename__ = "fuel_verifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    observation_id: Mapped[int] = mapped_column(ForeignKey("fuel_observations.id"))
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    verified_by: Mapped[str] = mapped_column(String(200))
    approval_state: Mapped[str] = mapped_column(String(20), default="PENDING")
    notes: Mapped[str | None] = mapped_column(Text)
    independent: Mapped[bool] = mapped_column(Boolean, default=False)


class FuelPriceSnapshot(Base):
    __tablename__ = "fuel_price_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("pricing_zones.id"))
    fuel_type: Mapped[str] = mapped_column(String(20))
    median_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    observation_count: Mapped[int] = mapped_column(Integer)
    observed_through: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    freshness_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[str] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RouteSnapshot(Base):
    __tablename__ = "route_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(50))
    origin: Mapped[dict] = mapped_column(JSON)
    destination: Mapped[dict] = mapped_column(JSON)
    distance_meters: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    polyline: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Quote(Base):
    __tablename__ = "quotes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    route_snapshot_id: Mapped[int] = mapped_column(ForeignKey("route_snapshots.id"))
    fuel_snapshot_id: Mapped[int] = mapped_column(ForeignKey("fuel_price_snapshots.id"))
    vehicle_class: Mapped[str] = mapped_column(String(30))
    breakdown: Mapped[dict] = mapped_column(JSON)
    rules_version: Mapped[str] = mapped_column(String(50))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
