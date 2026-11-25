import assert from 'node:assert/strict';
import test from 'node:test';
import { currentQuote, decodePolyline, demoStops, swapStops, tripCoordinates, updateStop, validCoordinates } from '../src/locations.ts';

const stops = { pickup: demoStops[0], destination: demoStops[1] };

test('swapping preserves each coordinate and source, including a cleared stop', () => {
  assert.deepEqual(swapStops(stops), { pickup: stops.destination, destination: stops.pickup });
  assert.deepEqual(swapStops({ ...stops, pickup: null }), { pickup: stops.destination, destination: null });
});

test('moving or clearing a stop updates the route inputs', () => {
  const pin = { latitude: 5.035, longitude: 8.330, label: 'Pinned pickup', source: 'map' };
  const updated = updateStop(stops, 'pickup', pin);
  assert.equal(updated.destination, stops.destination);
  assert.deepEqual(tripCoordinates(updated).pickup, { latitude: 5.035, longitude: 8.330 });
  assert.equal(tripCoordinates(updateStop(updated, 'pickup', null)), null);
  assert.equal(tripCoordinates({ pickup: pin, destination: pin }), null);
});

test('rejects nonfinite or out-of-range coordinates', () => {
  for (const point of [{ latitude: 91, longitude: 0 }, { latitude: 5, longitude: -181 }, { latitude: NaN, longitude: 8 }]) {
    assert.equal(validCoordinates(point), false);
    assert.equal(updateStop(stops, 'pickup', { ...stops.pickup, ...point }), stops);
  }
});

test('accepts only current, unexpired quotes', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const future = '2026-11-20T12:00:01Z';
  const quote = { quote_id: 'demo' };
  assert.equal(currentQuote(1, 2, quote, future, now), null);
  assert.equal(currentQuote(2, 2, quote, '2026-11-20T12:00:00Z', now), null);
  assert.equal(currentQuote(2, 2, quote, 'malformed', now), null);
  assert.equal(currentQuote(2, 2, quote, future, now), quote);
});

test('decodes road geometry and rejects incomplete encodings', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  for (const encoded of ['', '?', '~', '????~', '!']) assert.deepEqual(decodePolyline(encoded), []);
});
