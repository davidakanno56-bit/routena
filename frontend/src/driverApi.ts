import { baseUrl } from './api';

export const statuses = ['DRAFT', 'PENDING_REVIEW', 'MORE_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type DriverStatus = typeof statuses[number];
export const statusLabels: Record<DriverStatus, string> = {
  DRAFT: 'Draft', PENDING_REVIEW: 'In review', MORE_INFORMATION_REQUIRED: 'Corrections requested',
  APPROVED: 'Approved', REJECTED: 'Rejected', SUSPENDED: 'Suspended',
};

export const vehicles = [
  { category: 'Economy', image: 'economy', description: 'Compact cars and sedans' },
  { category: 'Comfort', image: 'comfort', description: 'Premium sedans and crossovers' },
  { category: 'Moto', image: 'moto', description: 'Motorcycles' },
] as const;
export type Category = typeof vehicles[number]['category'];
export type FuelType = 'PMS' | 'DIESEL' | 'HYBRID' | 'ELECTRIC';
export type City = { id: number; city: string; state: string; state_code: string };
export type ProfileInput = { full_name: string; phone: string; city_id: number };
type LoginInput = { email: string; password: string };
type Registration = ProfileInput & LoginInput & { demo_acknowledged: true };
export type VehicleInput = {
  category: Category; manufacturer: string; model: string; year: number; colour: string;
  registration_number: string; fuel_type: FuelType; claimed_fuel_efficiency: number | null;
};
type Documents = { licence_placeholder: string; vehicle_documents_ready: boolean };
export type DriverSummary = { id: number; full_name: string; city_id: number; status: DriverStatus; demo_only: true };
export type Application = DriverSummary & {
  email: string; phone: string; city: string; state: string; state_code: string;
  licence_placeholder: string | null; vehicle_documents_ready: boolean; review_feedback: string | null; documents_verified: false;
  vehicle: (Omit<VehicleInput, 'claimed_fuel_efficiency'> & {
    claimed_fuel_efficiency: string | null; status: DriverStatus; fuel_efficiency_verified: false;
  }) | null;
};
export type AdminApplication = Application & {
  history: { from_status: DriverStatus; to_status: DriverStatus; actor: 'DRIVER' | 'DEMO_ADMIN';
    feedback: string | null; occurred_at: string }[];
};
export type Decision = 'APPROVED' | 'REJECTED' | 'MORE_INFORMATION_REQUIRED' | 'SUSPENDED';
type SessionResponse = { access_token: string; expires_in: number };
export type DriverSession = { token: string; expiresAt: number };

export class DriverApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, {
  method = 'GET', body, token, signal,
}: { method?: 'GET' | 'POST' | 'PUT'; body?: object; token?: string; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`${baseUrl}/api/v1/${path}`, {
    method, signal, cache: 'no-store',
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail;
    let message = 'The demo service could not complete your request.';
    if (typeof detail === 'string') message = detail;
    if (Array.isArray(detail)) {
      message = detail.map(item => {
        const field = Array.isArray(item.location) ? item.location.at(-1) : null;
        return `${field ? String(field).replaceAll('_', ' ') + ': ' : ''}${item.message || 'Check this field.'}`;
      }).join(' ');
    }
    throw new DriverApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const driverApi = {
  cities: (signal?: AbortSignal) => request<City[]>('drivers/cities', { signal }),
  register: (body: Registration, signal?: AbortSignal) => request<Application>('drivers/register', { method: 'POST', body, signal }),
  login: (body: LoginInput, signal?: AbortSignal) => request<SessionResponse>('drivers/login', { method: 'POST', body, signal }),
  logout: (token: string, signal?: AbortSignal) => request<void>('drivers/logout', { method: 'POST', token, signal }),
  profile: (token: string, signal?: AbortSignal) => request<Application>('drivers/me', { token, signal }),
  saveProfile: (token: string, body: ProfileInput, signal?: AbortSignal) => request<Application>('drivers/me/profile', { token, method: 'PUT', body, signal }),
  saveVehicle: (token: string, body: VehicleInput, signal?: AbortSignal) => request<Application>('drivers/me/vehicle', { token, method: 'PUT', body, signal }),
  saveDocuments: (token: string, body: Documents, signal?: AbortSignal) => request<Application>('drivers/me/documents', { token, method: 'PUT', body, signal }),
  submit: (token: string, signal?: AbortSignal) => request<Application>('drivers/me/submit', { token, method: 'POST', signal }),
  queue: (token: string, status: DriverStatus, offset: number, signal?: AbortSignal) =>
    request<DriverSummary[]>(`admin/drivers?status=${status}&offset=${offset}`, { token, signal }),
  inspect: (token: string, id: number, signal?: AbortSignal) => request<AdminApplication>(`admin/drivers/${id}`, { token, signal }),
  review: (token: string, id: number, body: { status: Decision; feedback: string }, signal?: AbortSignal) =>
    request<Application>(`admin/drivers/${id}/review`, { token, method: 'POST', body, signal }),
};

export function driverError(error: unknown) {
  return error instanceof DriverApiError ? error.message : 'Could not reach the demo API. Check your connection and try again.';
}

export function field(form: FormData, name: string) {
  return String(form.get(name) ?? '');
}
