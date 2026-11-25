from decimal import Decimal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ROUTENA_", env_file=".env")
    database_url: str = "sqlite:///./routena.db"
    pilot_city: str = "Calabar"
    pilot_timezone: str = "Africa/Lagos"
    currency: str = "NGN"
    fare_rules_version: str = "calabar-pilot-v1"
    service_area_reference: str = "External Calabar service-area definition required"
    routing_provider: str = "google"
    osrm_base_url: str = "https://router.project-osrm.org"
    openrouteservice_base_url: str = "https://api.openrouteservice.org"
    openrouteservice_api_key: str | None = None
    demo_mode: bool = False
    driver_onboarding_demo: bool = False
    driver_review_token: str | None = None
    google_routes_api_key: str | None = None
    admin_token: str = "change-me"
    fuel_freshness_hours: int = 6
    minimum_fuel_observations: int = 2
    quote_expiry_minutes: int = 5
    base_driver_allowance: Decimal = Decimal("500")
    maintenance_per_km: Decimal = Decimal("65")
    time_allowance_per_minute: Decimal = Decimal("35")
    fuel_efficiency_km_per_litre: Decimal = Decimal("10")
    platform_commission_rate: Decimal = Decimal("0.08")
    pickup_allowance: Decimal = Decimal("0")
    tolls: Decimal = Decimal("0")
    payment_costs: Decimal = Decimal("0")
    applicable_taxes: Decimal = Decimal("0")
    driver_minimum_earnings: Decimal = Decimal("0")
    pickup_distance_km: Decimal = Decimal("0")
    pickup_time_minutes: Decimal = Decimal("0")
    traffic_delay_minutes: Decimal = Decimal("0")
    operating_overhead_per_km: Decimal = Decimal("0")
    minimum_driver_contribution_margin: Decimal = Decimal("0")
    driver_earnings_target: Decimal = Decimal("0")
    minimum_trip_fare: Decimal = Decimal("0")
    rounding_increment: Decimal = Decimal("50")
    allowed_vehicle_classes: tuple[str, ...] = ("STANDARD", "PREMIUM", "MOTORCYCLE")


settings = Settings()
