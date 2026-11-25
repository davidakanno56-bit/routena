export type Coordinates = { latitude: number; longitude: number };
export type StopKey = 'pickup' | 'destination';
export type Stop = Coordinates & { label: string; source: 'demo' | 'provider' | 'map' | 'device' };
export type Stops = Record<StopKey, Stop | null>;

export const demoStops: Stop[] = [
  { label: 'Margaret Ekpo International Airport', latitude: 5.0377, longitude: 8.3220, source: 'demo' },
  { label: 'Marian Market', latitude: 5.0150, longitude: 8.3410, source: 'demo' },
  { label: 'University of Calabar', latitude: 5.0377, longitude: 8.3330, source: 'demo' },
  { label: 'Watt Market', latitude: 5.0120, longitude: 8.3300, source: 'demo' },
  { label: 'Tinapa Business Resort', latitude: 5.0411, longitude: 8.3645, source: 'demo' },
];

export function validCoordinates(point: Coordinates) {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

export function swapStops(stops: Stops): Stops {
  return { pickup: stops.destination, destination: stops.pickup };
}

export function updateStop(stops: Stops, key: StopKey, point: Stop | null): Stops {
  return point && !validCoordinates(point) ? stops : { ...stops, [key]: point };
}

export function tripCoordinates({ pickup, destination }: Stops) {
  if (!pickup || !destination || !validCoordinates(pickup) || !validCoordinates(destination)) return null;
  if (pickup.latitude === destination.latitude && pickup.longitude === destination.longitude) return null;
  return {
    pickup: { latitude: pickup.latitude, longitude: pickup.longitude },
    destination: { latitude: destination.latitude, longitude: destination.longitude },
  };
}

export function currentQuote<T>(request: number, version: number, value: T, expiresAt: string, now = Date.now()): T | null {
  return request === version && Date.parse(expiresAt) > now ? value : null;
}

export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  const totals = [0, 0];
  let index = 0;
  while (index < encoded.length) {
    for (let axis = 0; axis < 2; axis++) {
      let value = 0;
      let shift = 0;
      let byte: number;
      do {
        if (index >= encoded.length || shift > 30) return [];
        byte = encoded.charCodeAt(index++) - 63;
        if (byte < 0 || byte > 63) return [];
        value |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32);
      totals[axis] += value & 1 ? ~(value >> 1) : value >> 1;
    }
    const [latitude, longitude] = totals.map(total => total / 1e5);
    if (!validCoordinates({ latitude, longitude })) return [];
    points.push([latitude, longitude]);
  }
  return points;
}
