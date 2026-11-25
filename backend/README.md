# Routena Calabar Pilot API

This repository contains a conservative FastAPI pilot pipeline. Google Routes and
fuel observations are dependency-injected, so tests and local development never
silently use simulated live data.

## Run

```powershell
py -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\uvicorn app.main:app --reload
```

Set `ROUTENA_DATABASE_URL`, `GOOGLE_ROUTES_API_KEY`, and `ROUTENA_ADMIN_TOKEN`
for a deployed environment. The default database is SQLite for the pilot.

The pilot is configured for Calabar, `Africa/Lagos`, and NGN. No geographic
boundary coordinates are embedded: production deployment must provide and
validate against an approved service-area reference before accepting live
coverage. The seeded pricing zone is only a data partition, not a boundary.

## Mock quote request

The test suite uses `MockRoutesAdapter`; no live Google route or fuel observation
is claimed by this repository. A request is:

```json
{
  "pickup": {"latitude": 5.0377, "longitude": 8.3220},
  "destination": {"latitude": 5.0150, "longitude": 8.3410},
  "vehicle_class": "STANDARD"
}
```
