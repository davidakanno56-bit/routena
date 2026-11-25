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
