from decimal import Decimal
import asyncio
from app.fare import calculate_fare
from app.models import FareRule
from app.routes import OSRMAdapter
from app.main import admin
from app.schemas import Coordinates, PricingSimulationRequest
import pytest
from fastapi.testclient import TestClient


def rule(version, base, commission):
    return FareRule(version=version, base_driver_allowance=Decimal(base),
                    maintenance_per_km=Decimal("65"), time_allowance_per_minute=Decimal("35"),
                    fuel_efficiency_km_per_litre=Decimal("10"), commission_rate=Decimal(commission),
                    rounding_increment=Decimal("50"), active=True, city_id=1)


def test_city_rules_are_isolated():
    first = calculate_fare(10000, 600, Decimal("200"), rule("city-a-v1", "500", "0.08"))
    second = calculate_fare(10000, 600, Decimal("300"), rule("city-b-v1", "1000", "0.05"))
    assert first["rules_version"] == "city-a-v1"
    assert second["rules_version"] == "city-b-v1"
    assert first["final_passenger_fare"] != second["final_passenger_fare"]


def test_fare_rounds_up_and_exposes_consumption():
    result = calculate_fare(1000, 60, Decimal("200"), rule("v1", "500", "0.08"))
    assert result["estimated_fuel_consumption_litres"] == Decimal("0.1")
    assert result["final_passenger_fare"] % Decimal("50") == 0


@pytest.mark.parametrize(
    ("distance", "duration", "fuel_price", "traffic"),
    [
        (1000, 300, "1200", "0"),
        (50000, 3600, "1200", "0"),
        (10000, 1200, "1800", "45"),
    ],
)
def test_driver_economics_cover_trip_scenarios(distance, duration, fuel_price, traffic):
    configured = rule("economics-v1", "500", "0.08")
    configured.vehicle_class = "STANDARD"
    configured.pickup_distance_km = Decimal("2")
    configured.pickup_time_minutes = Decimal("8")
    configured.traffic_delay_minutes = Decimal(traffic)
    configured.operating_overhead_per_km = Decimal("20")
    configured.minimum_driver_contribution_margin = Decimal("300")
    configured.driver_earnings_target = Decimal("1200")
    result = calculate_fare(distance, duration, Decimal(fuel_price), configured)
    assert result["total_operating_distance_km"] == result["road_distance_km"] + Decimal("2")
    assert result["driver_contribution_margin"] >= Decimal("300")
    assert result["driver_gross_earnings"] >= Decimal("1200")
    assert result["platform_commission"] == result["commission_base"] * Decimal("0.08")


def test_minimum_trip_fare_is_a_floor_not_a_second_commission():
    configured = rule("minimum-v1", "500", "0.08")
    configured.minimum_trip_fare = Decimal("2000")
    result = calculate_fare(1000, 60, Decimal("200"), configured)
    assert result["final_passenger_fare"] >= Decimal("2000")
    assert result["platform_commission"] == result["commission_base"] * Decimal("0.08")


def test_rule_charge_components_are_explicit_and_not_commissioned():
    configured = rule("charges-v1", "500", "0.08")
    configured.pickup_allowance = Decimal("100")
    configured.tolls = Decimal("250")
    configured.payment_costs = Decimal("50")
    configured.applicable_taxes = Decimal("25")
    result = calculate_fare(1000, 60, Decimal("200"), configured)
    assert result["pickup_allowance"] == Decimal("100")
    assert result["tolls"] == Decimal("250")
    assert result["payment_costs"] == Decimal("50")
    assert result["applicable_taxes"] == Decimal("25")
    assert result["platform_commission"] == result["commission_base"] * Decimal("0.08")


def test_simulation_uses_transient_rule_and_returns_hypothetical_result():
    from app.main import pricing_simulation

    request = PricingSimulationRequest(
        city="Lagos", vehicle_class="PREMIUM", distance_km="20",
        duration_minutes="45", fuel_price_per_litre="1500",
        fuel_efficiency_km_per_litre="8", maintenance_per_km="80",
        minimum_driver_contribution_margin="500", commission_rate="0.08",
    )
    result = pricing_simulation(request, "admin")
    assert result["hypothetical"] is True
    assert result["label"].startswith("HYPOTHETICAL")
    assert result["fare_breakdown"]["driver_contribution_margin"]
    assert result["fare_breakdown"]["platform_commission"]


def test_simulation_requires_admin_authorization():
    from app.main import app

    response = TestClient(app).post("/api/v1/admin/pricing-simulations", json={
        "city": "Calabar", "vehicle_class": "STANDARD", "distance_km": "5",
        "duration_minutes": "15", "fuel_price_per_litre": "1200",
        "fuel_efficiency_km_per_litre": "10", "maintenance_per_km": "65",
        "minimum_driver_contribution_margin": "300", "commission_rate": "0.08",
    })
    assert response.status_code == 401


def test_configured_admin_token_is_accepted():
    from app.config import settings
    from app.main import admin

    assert admin(settings.admin_token) == "admin"


def test_invalid_coordinates_and_admin_authorization():
    with pytest.raises(ValueError):
        Coordinates(latitude=95, longitude=8)
    with pytest.raises(Exception, match="admin authentication required"):
        admin(None)


def test_osrm_failure_is_explicit():
    with pytest.raises(RuntimeError, match="OSRM request failed"):
        asyncio.run(OSRMAdapter("http://127.0.0.1:1").route(
            {"latitude": 5, "longitude": 8}, {"latitude": 5.1, "longitude": 8.1}
        ))
