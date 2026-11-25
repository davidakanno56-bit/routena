import json
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import City, PricingZone, ServiceZone


def _contains(point: tuple[float, float], geometry: dict) -> bool:
    coordinates = geometry["coordinates"][0]
    x, y = point
    inside = False
    for index in range(len(coordinates)):
        x1, y1 = coordinates[index - 1]
        x2, y2 = coordinates[index]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def resolve_service_area(db: Session, latitude: float, longitude: float):
    for zone, city in db.execute(
        select(ServiceZone, City).join(City, City.id == ServiceZone.city_id)
        .where(ServiceZone.active.is_(True), City.is_active.is_(True))
    ).all():
        if not zone.boundary_geojson:
            continue
        if _contains((longitude, latitude), json.loads(zone.boundary_geojson)):
            pricing = db.scalar(select(PricingZone).where(PricingZone.service_zone_id == zone.id, PricingZone.active.is_(True)))
            if pricing:
                return city, zone, pricing
    raise ValueError("pickup is outside an activated service area")
