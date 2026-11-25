# Routena frontend API contract

The Google Stitch frontend must call the backend, not calculate fares locally.
Local development origin `http://localhost:5173` is allowed by CORS.

## `POST /api/v1/quotes`

Request:

```json
{
  "pickup": {"latitude": 5.0377, "longitude": 8.3220},
  "destination": {"latitude": 5.0150, "longitude": 8.3410},
  "vehicle_class": "STANDARD"
}
```

Coordinates must be valid WGS84 latitude/longitude values. Both stops must be
inside activated service areas. The pickup pricing zone needs approved fresh
PMS observations and active city fare rules.

Response shape:

```json
{
  "quote_id": "uuid",
  "expires_at": "2026-11-04T20:00:00Z",
  "city": "Calabar",
  "service_zone": "configured-zone",
  "route": {
    "distance_meters": 4200,
    "duration_seconds": 900,
    "polyline": "provider-returned-encoded-polyline"
  },
  "fuel": {
    "price_ngn_per_litre": 0,
    "observed_through": "2026-11-04T18:00:00Z"
  },
  "fare_breakdown": {
    "road_distance_km": "4.2",
    "estimated_duration_minutes": "15",
    "fuel_cost": "0",
    "maintenance": "0",
    "time_allowance": "0",
    "base_driver_allowance": "0",
    "pickup_distance_km": "0",
    "pickup_time_minutes": "0",
    "traffic_delay_minutes": "0",
    "operating_overhead": "0",
    "modeled_operating_costs": "0",
    "driver_contribution_margin": "0",
    "minimum_driver_contribution_margin": "0",
    "driver_earnings_target": "0",
    "pickup_allowance": "0",
    "tolls": "0",
    "payment_costs": "0",
    "applicable_taxes": "0",
    "driver_gross_share": "0",
    "commission_base": "0",
    "commission": "0",
    "total": "0",
    "currency": "NGN",
    "rules_version": "city-rule-version"
  }
}
```

The numeric values above are schema examples only, not live prices or route
measurements. `409` means the coordinates are outside activated coverage;
`503` means routing, fuel, or fare configuration is unavailable; `422` means
request validation failed.

Fare rules are editable per city and vehicle class. Driver economics use the
configured pickup distance/time, traffic delay, fuel, maintenance, operating
overhead, contribution-margin floor, earnings target, minimum trip fare,
commission, payment costs, taxes, and tolls. Commission is applied once to
the driver gross share and is returned with its commission base. Synthetic
fuel observations remain restricted to explicit demo mode.

## Admin endpoints

- `POST /api/v1/admin/fuel-observations`
- `POST /api/v1/admin/fuel-observations/{id}/approve`
- `POST /api/v1/admin/fuel-observations/{id}/reject`
- `PATCH /api/v1/admin/cities/{id}?active=true|false`

Admin calls require `Authorization: Bearer <ROUTENA_ADMIN_TOKEN>`.

## Environment

`ROUTENA_DATABASE_URL`, `ROUTENA_ROUTING_PROVIDER` (`google`, `osrm`, or
`mock`), `ROUTENA_OSRM_BASE_URL`, `GOOGLE_ROUTES_API_KEY` when using Google,
and `ROUTENA_ADMIN_TOKEN` are supported. Public OSRM demos are for development
only and must not be treated as production infrastructure.

## Future payments

The planned flow is: passenger pays -> payment verified -> driver assigned ->
trip completed -> six-digit PIN verified -> driver payout becomes eligible for
release. Cancellation policy, refunds, disputes, and delayed settlement require
an approved payment-provider agreement. No escrow or real-fund release is
implemented in this backend.

## Passenger route preview and search

`POST /api/v1/route-previews` accepts the quote body without `vehicle_class`.
Both endpoints validate WGS84 ranges and require each stop to resolve to an
activated service area. The pickup determines the fare's pricing zone. Identical
stops return `422`, out-of-coverage stops return `409`, and routing failures or
incomplete road data return `503`. A successful preview returns
`distance_meters`, `duration_seconds`, and `polyline` (encoded polyline5).
It does not write a quote or need fuel observations. The quote endpoint queries
routing again and uses that response for pricing. The current routing profile
uses cars, including as an approximation for Moto estimates.

Without `VITE_GEOCODER_URL`, pickup and destination search use curated Calabar
demo points. For a different search provider, set that variable to a compatible
endpoint or your own server-side adapter. On explicit search the frontend calls
`GET <endpoint>?q=<search term>`. Return a JSON array of objects with `label`,
`latitude`, and `longitude`, with WGS84 coordinates as JSON numbers. A separate
origin must allow the frontend origin through CORS. Keep provider credentials
on the adapter server. This integration makes no calls to public Nominatim.
