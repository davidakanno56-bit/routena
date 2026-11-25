from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class Coordinates(BaseModel):
    latitude: float
    longitude: float

    @field_validator("latitude")
    @classmethod
    def valid_latitude(cls, value: float) -> float:
        if not -90 <= value <= 90:
            raise ValueError("latitude must be between -90 and 90")
        return value

    @field_validator("longitude")
    @classmethod
    def valid_longitude(cls, value: float) -> float:
        if not -180 <= value <= 180:
            raise ValueError("longitude must be between -180 and 180")
        return value


class FuelSubmission(BaseModel):
    station_id: int
    fuel_type: str
    price: Decimal = Field(gt=0)
    source: str
    evidence_reference: str = Field(min_length=1)
    observed_at: datetime
    is_demo: bool = False


class ReviewRequest(BaseModel):
    notes: str | None = None
    independent: bool = False


class RouteRequest(BaseModel):
    pickup: Coordinates
    destination: Coordinates


class QuoteRequest(RouteRequest):
    vehicle_class: str


class PricingSimulationRequest(BaseModel):
    city: str = Field(min_length=1, max_length=100)
    vehicle_class: str
    distance_km: Decimal = Field(gt=0)
    duration_minutes: Decimal = Field(gt=0)
    fuel_price_per_litre: Decimal = Field(gt=0)
    fuel_efficiency_km_per_litre: Decimal = Field(gt=0)
    maintenance_per_km: Decimal = Field(ge=0)
    minimum_driver_contribution_margin: Decimal = Field(ge=0)
    commission_rate: Decimal = Field(ge=0, le=1)
    pickup_distance_km: Decimal = Field(default=Decimal("0"), ge=0)
    pickup_time_minutes: Decimal = Field(default=Decimal("0"), ge=0)
    traffic_delay_minutes: Decimal = Field(default=Decimal("0"), ge=0)
    operating_overhead_per_km: Decimal = Field(default=Decimal("0"), ge=0)
    base_driver_allowance: Decimal = Field(default=Decimal("500"), ge=0)
    time_allowance_per_minute: Decimal = Field(default=Decimal("35"), ge=0)
    rounding_increment: Decimal = Field(default=Decimal("50"), gt=0)
    minimum_trip_fare: Decimal = Field(default=Decimal("0"), ge=0)
    pickup_allowance: Decimal = Field(default=Decimal("0"), ge=0)
    tolls: Decimal = Field(default=Decimal("0"), ge=0)
    payment_costs: Decimal = Field(default=Decimal("0"), ge=0)
    applicable_taxes: Decimal = Field(default=Decimal("0"), ge=0)


class RouteResult(BaseModel):
    distance_meters: int
    duration_seconds: int
    polyline: str
