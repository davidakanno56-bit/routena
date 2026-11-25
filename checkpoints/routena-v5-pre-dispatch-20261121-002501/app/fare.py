from decimal import Decimal, ROUND_CEILING
from .config import settings


def calculate_fare(distance_meters: int, duration_seconds: int, fuel_price: Decimal, rule=None) -> dict[str, Decimal | str]:
    def value(name: str, setting_name: str) -> Decimal:
        configured = getattr(rule, name, None) if rule else None
        return Decimal(configured if configured is not None else getattr(settings, setting_name))

    base = Decimal(rule.base_driver_allowance if rule else settings.base_driver_allowance)
    maintenance_rate = Decimal(rule.maintenance_per_km if rule else settings.maintenance_per_km)
    time_rate = Decimal(rule.time_allowance_per_minute if rule else settings.time_allowance_per_minute)
    efficiency = Decimal(rule.fuel_efficiency_km_per_litre if rule else settings.fuel_efficiency_km_per_litre)
    commission_rate = Decimal(rule.commission_rate if rule else settings.platform_commission_rate)
    rounding = Decimal(rule.rounding_increment if rule else settings.rounding_increment)
    pickup_km = value("pickup_distance_km", "pickup_distance_km")
    pickup_minutes = value("pickup_time_minutes", "pickup_time_minutes")
    traffic_delay = value("traffic_delay_minutes", "traffic_delay_minutes")
    overhead_rate = value("operating_overhead_per_km", "operating_overhead_per_km")
    minimum_margin = value("minimum_driver_contribution_margin", "minimum_driver_contribution_margin")
    earnings_target = value("driver_earnings_target", "driver_earnings_target")
    minimum_trip_fare = value("minimum_trip_fare", "minimum_trip_fare")
    pickup_allowance = value("pickup_allowance", "pickup_allowance")
    tolls = value("tolls", "tolls")
    payment_costs = value("payment_costs", "payment_costs")
    applicable_taxes = value("applicable_taxes", "applicable_taxes")
    km = Decimal(distance_meters) / Decimal(1000)
    trip_minutes = Decimal(duration_seconds) / Decimal(60)
    total_km = km + pickup_km
    total_minutes = trip_minutes + pickup_minutes + traffic_delay
    fuel_consumption = total_km / efficiency
    fuel_cost = fuel_consumption * fuel_price
    maintenance = maintenance_rate * total_km
    time_allowance = time_rate * total_minutes
    operating_overhead = overhead_rate * total_km
    modeled_operating_costs = fuel_cost + maintenance + operating_overhead
    required_driver_gross = max(
        Decimal(settings.driver_minimum_earnings),
        earnings_target,
        modeled_operating_costs + minimum_margin,
    )
    cost_plus_driver_gross = base + time_allowance + modeled_operating_costs
    driver_gross = max(required_driver_gross, cost_plus_driver_gross)
    contribution_margin = driver_gross - modeled_operating_costs
    if contribution_margin < minimum_margin or driver_gross < earnings_target:
        raise ValueError("quote fails configured driver minimum economics")
    commission = driver_gross * commission_rate
    passenger_before_rounding = (driver_gross + commission +
                                  pickup_allowance + tolls +
                                  payment_costs + applicable_taxes)
    total = (max(passenger_before_rounding, minimum_trip_fare) / rounding).to_integral_value(
        rounding=ROUND_CEILING
    ) * rounding
    return {
        "road_distance_km": km, "estimated_duration_minutes": trip_minutes,
        "pickup_distance_km": pickup_km, "pickup_time_minutes": pickup_minutes,
        "traffic_delay_minutes": traffic_delay, "total_operating_distance_km": total_km,
        "total_operating_time_minutes": total_minutes,
        "estimated_fuel_consumption_litres": fuel_consumption, "fuel_cost": fuel_cost,
        "maintenance_allowance": maintenance, "time_allowance": time_allowance,
        "operating_overhead": operating_overhead,
        "modeled_operating_costs": modeled_operating_costs,
        "base_driver_allowance": base, "driver_gross_earnings": driver_gross,
        "driver_contribution_margin": contribution_margin,
        "minimum_driver_contribution_margin": minimum_margin,
        "driver_earnings_target": earnings_target,
        "minimum_trip_fare": minimum_trip_fare,
        "pickup_allowance": pickup_allowance, "tolls": tolls,
        "payment_costs": payment_costs, "applicable_taxes": applicable_taxes,
        "platform_commission": commission, "commission_base": driver_gross,
        "final_passenger_fare": total,
        "commission_rate": commission_rate,
        "rules_version": rule.version if rule else settings.fare_rules_version,
    }
