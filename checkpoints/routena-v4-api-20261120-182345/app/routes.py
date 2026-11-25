import httpx
from .config import settings
from .schemas import RouteResult


class GoogleRoutesAdapter:
    async def route(self, origin: dict, destination: dict) -> RouteResult:
        if not settings.google_routes_api_key:
            raise RuntimeError("Google Routes API credentials are not configured")
        payload = {"origin": {"location": {"latLng": {"latitude": origin["latitude"], "longitude": origin["longitude"]}}},
                   "destination": {"location": {"latLng": {"latitude": destination["latitude"], "longitude": destination["longitude"]}}},
                   "travelMode": "DRIVE", "routingPreference": "TRAFFIC_AWARE",
                   "polylineQuality": "OVERVIEW"}
        headers = {"X-Goog-Api-Key": settings.google_routes_api_key,
                   "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post("https://routes.googleapis.com/directions/v2:computeRoutes", json=payload, headers=headers)
                response.raise_for_status()
                route = response.json().get("routes", [None])[0]
                if not route:
                    raise RuntimeError("Google Routes returned no route")
                duration = route["duration"].rstrip("s")
                return RouteResult(distance_meters=route["distanceMeters"], duration_seconds=int(float(duration)),
                                   polyline=route["polyline"]["encodedPolyline"])
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise RuntimeError(f"Google Routes request failed: {exc}") from exc


class MockRoutesAdapter:
    def __init__(self, result: RouteResult):
        self.result = result

    async def route(self, origin: dict, destination: dict) -> RouteResult:
        return self.result


class OSRMAdapter:
    def __init__(self, base_url: str = settings.osrm_base_url):
        self.base_url = base_url.rstrip("/")

    async def route(self, origin: dict, destination: dict) -> RouteResult:
        url = f"{self.base_url}/route/v1/driving/{origin['longitude']},{origin['latitude']};{destination['longitude']},{destination['latitude']}"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, params={"overview": "full", "geometries": "polyline"})
                response.raise_for_status()
                body = response.json()
                if body.get("code") != "Ok" or not body.get("routes"):
                    raise RuntimeError("OSRM returned no route")
                route = body["routes"][0]
                return RouteResult(distance_meters=int(route["distance"]), duration_seconds=int(route["duration"]),
                                   polyline=route["geometry"])
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(f"OSRM request failed: {exc}") from exc


class OpenRouteServiceAdapter:
    def __init__(self):
        if not settings.openrouteservice_api_key:
            raise RuntimeError("OpenRouteService credentials are not configured")

    async def route(self, origin: dict, destination: dict) -> RouteResult:
        url = f"{settings.openrouteservice_base_url.rstrip('/')}/v2/directions/driving-car"
        body = {"coordinates": [[origin["longitude"], origin["latitude"]],
                                [destination["longitude"], destination["latitude"]]],
                "geometry": "encodedpolyline"}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, json=body,
                                             headers={"Authorization": settings.openrouteservice_api_key})
                response.raise_for_status()
                route = response.json()["routes"][0]
                summary = route["summary"]
                return RouteResult(distance_meters=int(summary["distance"]),
                                   duration_seconds=int(summary["duration"]),
                                   polyline=route["geometry"])
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise RuntimeError(f"OpenRouteService request failed: {exc}") from exc


def routing_adapter():
    if settings.routing_provider == "osrm":
        return OSRMAdapter()
    if settings.routing_provider == "mock":
        return MockRoutesAdapter(RouteResult(distance_meters=1, duration_seconds=1, polyline=""))
    if settings.routing_provider == "openrouteservice":
        return OpenRouteServiceAdapter()
    if settings.routing_provider == "google":
        return GoogleRoutesAdapter()
    raise RuntimeError(f"unsupported routing provider: {settings.routing_provider}")
