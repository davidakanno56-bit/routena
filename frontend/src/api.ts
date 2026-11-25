import { decodePolyline, type Coordinates } from "./locations";
export type { Coordinates } from "./locations";

export type RoadRoute = { distance_meters: number; duration_seconds: number; polyline: string };
export type RouteRequest = { pickup: Coordinates; destination: Coordinates };
export type QuoteRequest = RouteRequest & { vehicle_class: string };
export type Quote = {
  quote_id: string; expires_at: string; city: string; service_zone: string;
  demo_only?: boolean; label?: string;
  route: RoadRoute;
  fuel: { price_ngn_per_litre: string; observed_through: string };
  fare_breakdown: Record<string, string>;
};
export type PricingSimulationRequest = {
  city: string; vehicle_class: string; distance_km: string; duration_minutes: string;
  fuel_price_per_litre: string; fuel_efficiency_km_per_litre: string;
  maintenance_per_km: string; minimum_driver_contribution_margin: string;
  commission_rate: string; pickup_distance_km: string; pickup_time_minutes: string;
  traffic_delay_minutes: string; operating_overhead_per_km: string;
  base_driver_allowance: string; time_allowance_per_minute: string;
  rounding_increment: string; minimum_trip_fare: string; pickup_allowance: string;
  tolls: string; payment_costs: string; applicable_taxes: string;
};

export const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001';

async function post<T>(path: string, body: RouteRequest, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${baseUrl}/api/v1/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(typeof payload?.detail === 'string' ? payload.detail : 'The trip service is unavailable. Please try again.');
  }
  return payload as T;
}

function requireRoadRoute(route: RoadRoute) {
  if (!route || !Number.isFinite(route.distance_meters) || route.distance_meters <= 0
    || !Number.isFinite(route.duration_seconds) || route.duration_seconds <= 0
    || typeof route.polyline !== 'string' || decodePolyline(route.polyline).length < 2) {
    throw new Error('The route service returned incomplete road data. Please try again.');
  }
  return route;
}

export async function requestRoadRoute(body: RouteRequest, signal: AbortSignal) {
  return requireRoadRoute(await post<RoadRoute>('route-previews', body, signal));
}

export async function requestQuote(body: QuoteRequest, signal?: AbortSignal): Promise<Quote> {
  const quote = await post<Quote>('quotes', body, signal);
  requireRoadRoute(quote.route);
  return quote;
}

export async function healthCheck(): Promise<boolean> {
  try { return (await fetch(`${baseUrl}/health`)).ok; } catch { return false; }
}

export async function simulatePricing(body: PricingSimulationRequest, token: string) {
  const response = await fetch(`${baseUrl}/api/v1/admin/pricing-simulations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.detail || 'The pricing simulator request failed.');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as { hypothetical: boolean; label: string; city: string; vehicle_class: string; fare_breakdown: Record<string, string> };
}

export type Ride = {
  id: string;
  status: 'REQUESTED' | 'SEARCHING' | 'OFFERED' | 'ACCEPTED' | 'DRIVER_ARRIVING' | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'COMPLETED_DEMO' | 'CANCELLED' | 'EXPIRED' | 'NO_DRIVER_AVAILABLE';
  quote_id: string;
  vehicle_class: string;
  pickup: Coordinates;
  destination: Coordinates;
  route: RoadRoute;
  fare_ngn: string;
  escrow_amount_ngn?: string;
  platform_fee_ngn?: string;
  driver_payout_ngn?: string;
  payout_status?: string;
  escrow_pin?: string;
  offer_until?: number | null;
  updated_at: number;
  driver?: {
    name: string;
    vehicle: string;
    colour: string;
    plate: string;
  } | null;
  driver_gross_ngn?: string;
  driver_margin_ngn?: string;
  pickup_proximity_meters?: number | null;
};

export type DriverStatus = {
  demo_only: boolean;
  eligible: boolean;
  online: boolean;
  locations: string[];
  last_seen: number | null;
  expires_at: number | null;
  service_area: string | null;
  ride: Ride | null;
  wallet_balance_ngn?: string;
  completed_trips_count?: number;
};

export async function quickPassengerSession(): Promise<{ access_token: string; passenger_id: number; email: string }> {
  const res = await fetch(`${baseUrl}/api/v1/dispatch/passengers/quick-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Could not establish passenger session.');
  return res.json();
}

export async function createRide(
  quoteId: string,
  pickup: Coordinates,
  destination: Coordinates,
  vehicleClass: string,
  token: string
): Promise<Ride> {
  const res = await fetch(`${baseUrl}/api/v1/dispatch/rides`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      quote_id: quoteId,
      pickup,
      destination,
      vehicle_class: vehicleClass,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || 'Ride request failed.');
  return data as Ride;
}

export async function getCurrentRide(token: string): Promise<Ride | null> {
  const res = await fetch(`${baseUrl}/api/v1/dispatch/rides/current`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function cancelRide(rideId: string, token: string): Promise<Ride> {
  const res = await fetch(`${baseUrl}/api/v1/dispatch/rides/${rideId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || 'Could not cancel ride.');
  return data as Ride;
}

export async function getDriverStatus(token: string): Promise<DriverStatus> {
  const res = await fetch(`${baseUrl}/api/v1/dispatch/driver/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || 'Could not fetch driver status.');
  return data as DriverStatus;
}

export async function setDriverAvailability(
  online: boolean,
  location: string | null,
  token: string
): Promise<DriverStatus> {
  const res = await fetch(`${baseUrl}/api/v1/dispatch/driver/availability`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      online,
      location,
      synthetic_location_consent: true,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || 'Could not update availability.');
  return data as DriverStatus;
}

export async function driverAction(
  rideId: string,
  action: 'accept' | 'decline' | 'advance',
  expectedStatus: string,
  token: string,
  escrowPin?: string
): Promise<DriverStatus> {
  const res = await fetch(`${baseUrl}/api/v1/dispatch/driver/rides/${rideId}/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action,
      expected_status: expectedStatus,
      escrow_pin: escrowPin,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || 'Action failed.');
  return data as DriverStatus;
}
