import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { motion } from 'framer-motion';
import { requestQuote, simulatePricing, type Quote, type Coordinates, type PricingSimulationRequest } from './api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const testLocations: Record<string, Coordinates> = {
  'Margaret Ekpo International Airport': { latitude: 5.0377, longitude: 8.3220 },
  'Marian Market': { latitude: 5.0150, longitude: 8.3410 },
  'University of Calabar': { latitude: 5.0377, longitude: 8.3330 },
  'Watt Market': { latitude: 5.0120, longitude: 8.3300 },
  'Tinapa Business Resort': { latitude: 5.0411, longitude: 8.3645 },
};

function Header() {
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="Routena home">
        <span className="brand-mark">↗</span>
        <span>ROUTENA</span>
      </Link>
      <div className="topbar-cluster">
        <span className="pill live">● Nationwide mobility · Calabar pilot</span>
        <span className="pill neutral">NGN</span>
      </div>
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink className="nav-link" to="/">Home</NavLink>
      <NavLink className="nav-link" to="/book">Book Ride</NavLink>
      <NavLink className="nav-link" to="/drive">Drive</NavLink>
      <NavLink className="nav-link" to="/fleet">Fleet</NavLink>
    </nav>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell"><Header />{children}<BottomNav /></div>;
}

function Landing() {
  const metrics = [
    { label: 'Calabar pilot', value: 'NGN pricing' },
    { label: 'Fuel verified', value: 'Fresh PMS' },
    { label: 'Routes', value: 'Road-based' },
  ];

  const highlights = [
    { icon: 'route', title: 'Verified trip routing', text: 'Road distances and travel times are returned from the backend route engine.' },
    { icon: 'local_gas_station', title: 'Transparent fuel logic', text: 'The fare quote reflects current approved local pricing and explicit demo labels.' },
    { icon: 'shield', title: 'Fair driver economics', text: 'Driver earnings are protected using the configured economic minimums.' },
  ];

  return (
    <Shell>
      <main className="page home-page">
        <motion.section className="hero-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="hero-copy">
            <span className="eyebrow">Akanno Tech Labs Mobility System</span>
            <h1>
              Every kilometre.<br />
              <span className="accent">A fairer fare.</span>
            </h1>
            <p>
              Fuel-smart movement built for Nigeria. Transparent quotes, verified pricing, and a nationwide architecture starting from Calabar.
            </p>
            <div className="cta-row">
              <Link className="button" to="/book">Book a ride</Link>
              <Link className="button secondary" to="/drive">Drive with Routena</Link>
            </div>
            <div className="stats-row">
              {metrics.map((metric) => (
                <div className="meta-stat" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <motion.div className="visual-panel" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.55, delay: 0.1 }}>
            <div className="visual-map-card">
              <div className="map-badge">Calabar pilot · development</div>
              <div className="route-glow" />
              <div className="map-cta">
                <span className="material-symbols-outlined">location_on</span>
                Live road route preview
              </div>
              <div className="route-trace" />
              <div className="location-tag start-tag">Airport</div>
              <div className="location-tag end-tag">Marian Market</div>
            </div>
            <div className="floating-estimate">
              <div className="floating-head">
                <span className="material-symbols-outlined">bolt</span>
                Estimated fare
              </div>
              <strong>₦6,800</strong>
              <small>Road distance · 4.2 km</small>
            </div>
          </motion.div>
        </motion.section>

        <section className="feature-grid">
          {highlights.map((item, index) => (
            <motion.article
              className="feature-card"
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 + index * 0.1 }}
            >
              <div className="feature-icon material-symbols-outlined">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </motion.article>
          ))}
        </section>
      </main>
    </Shell>
  );
}

function Booking() {
  const [pickup, setPickup] = useState('Margaret Ekpo International Airport');
  const [destination, setDestination] = useState('Marian Market');
  const [vehicle, setVehicle] = useState('STANDARD');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setMessage('');
    setQuote(null);
    try {
      setQuote(await requestQuote({ pickup: testLocations[pickup], destination: testLocations[destination], vehicle_class: vehicle }));
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      setMessage(
        status === 409
          ? 'This pickup is outside an activated service area.'
          : status === 503
            ? 'Routing, fare rules, or verified fuel data is currently unavailable.'
            : status === 422
              ? 'Please check the selected locations and vehicle class.'
              : (error as Error).message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <main className="booking-page-v3">
        <div className="booking-shell">
          <motion.div className="map-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <LeafletMap pickup={testLocations[pickup]} destination={testLocations[destination]} polyline={quote?.route.polyline} />
          </motion.div>

          <div className="booking-side">
            <motion.form className="journey-card" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }}>
              <div className="section-head">
                <div>
                  <span className="eyebrow dark">Journey</span>
                  <h2>Plan your trip</h2>
                </div>
                <span className="mini-badge">Calabar pilot</span>
              </div>

              <div className="location-stack">
                <div className="location-row">
                  <span className="location-dot pickup-dot" aria-hidden="true"><span /></span>
                  <div className="location-copy">
                    <label htmlFor="pickup">Pickup</label>
                    <select id="pickup" value={pickup} onChange={(event) => setPickup(event.target.value)}>
                      {Object.keys(testLocations).map((location) => (
                        <option key={location} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="location-row">
                  <span className="location-dot destination-dot" aria-hidden="true"><span /></span>
                  <div className="location-copy">
                    <label htmlFor="destination">Destination</label>
                    <select id="destination" value={destination} onChange={(event) => setDestination(event.target.value)}>
                      {Object.keys(testLocations).map((location) => (
                        <option key={location} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="quick-locations">
                <span>Quick:</span>
                <button type="button" onClick={() => setDestination('University of Calabar')}><span className="material-symbols-outlined">school</span>UNICAL</button>
                <button type="button" onClick={() => setDestination('Marian Market')}><span className="material-symbols-outlined">local_mall</span>Marian</button>
                <button type="button" onClick={() => setPickup('Margaret Ekpo International Airport')}><span className="material-symbols-outlined">flight</span>Airport</button>
              </div>
            </motion.form>

            <motion.section className="vehicle-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }}>
              <div className="section-head">
                <div>
                  <span className="eyebrow dark">Vehicle</span>
                  <h3>Select service tier</h3>
                </div>
                <span className="mini-badge demo">Demo dispatch</span>
              </div>

              <div className="vehicle-options">
                {[
                  ['STANDARD', 'Routena Economy', 'Clean sedans and compact cars', 'directions_car', 'Best value'],
                  ['PREMIUM', 'Routena Comfort', 'Premium sedans and crossovers', 'airport_shuttle', 'Quiet ride'],
                  ['MOTORCYCLE', 'Routena Moto', 'Fast, lightweight city trips', 'two_wheeler', 'Agile'],
                ].map(([value, name, description, icon, badge]) => (
                  <button
                    type="button"
                    key={value}
                    className={`vehicle-option ${vehicle === value ? 'selected' : ''}`}
                    onClick={() => setVehicle(value)}
                  >
                    <span className="vehicle-icon material-symbols-outlined">{icon}</span>
                    <span className="vehicle-copy">
                      <strong>{name}</strong>
                      <small>{description}</small>
                      <em>{vehicle === value ? 'Selected for quote' : badge}</em>
                    </span>
                    <span className="vehicle-radio" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </motion.section>

            {quote && <QuoteCard quote={quote} />}

            <div className="booking-action">
              <button className="button booking-submit" type="button" disabled={loading} onClick={() => void submit()}>
                {loading ? 'Requesting quote…' : <><span className="material-symbols-outlined">shield</span>Request backend quote</>}
              </button>
              <p><span className="material-symbols-outlined">key</span>Development quote only. No payment or driver dispatch is connected.</p>
            </div>

            {message && <div className="notice error" role="alert">{message}</div>}
          </div>
        </div>
      </main>
    </Shell>
  );
}

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);

    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

function LeafletMap({ pickup, destination, polyline }: { pickup: Coordinates; destination: Coordinates; polyline?: string }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current).setView([pickup.latitude, pickup.longitude], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const pickupMarker = L.marker([pickup.latitude, pickup.longitude]).addTo(map).bindTooltip('Pickup');
    const destinationMarker = L.marker([destination.latitude, destination.longitude]).addTo(map).bindTooltip('Destination');
    const route = polyline ? L.polyline(decodePolyline(polyline), { color: '#0a8d6d', weight: 5, opacity: 0.9 }).addTo(map) : null;
    const bounds = route ? route.getBounds() : L.latLngBounds([pickupMarker.getLatLng(), destinationMarker.getLatLng()]);

    map.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
    return () => { map.remove(); };
  }, [pickup, destination, polyline]);

  return (
    <div className="map-frame booking-map-frame">
      <div ref={element} className="leaflet-map" />
      <div className="map-route-pill"><span />{polyline ? 'Route returned by backend' : 'Choose a route to preview'}</div>
      <div className="map-controls" aria-hidden="true">
        <span className="material-symbols-outlined">my_location</span>
        <span className="material-symbols-outlined">layers</span>
      </div>
      <div className="map-destination-pill"><span className="material-symbols-outlined">location_on</span>Calabar pilot</div>
      <small className="map-attribution-note">Development coordinates only · no live drivers</small>
    </div>
  );
}

function QuoteCard({ quote }: { quote: Quote }) {
  const fare = quote.fare_breakdown;
  const money = (value?: string) => {
    if (!value) return '—';
    const number = Number(value);
    return Number.isFinite(number) ? `₦${number.toLocaleString('en-NG')}` : '—';
  };

  return (
    <section className="fare-card">
      <div className="fare-card-header">
        <div className="fare-icon material-symbols-outlined">local_gas_station</div>
        <div>
          <h2>Transparent fare</h2>
          <p>{quote.city} pilot · backend-calculated</p>
        </div>
        <span className="material-symbols-outlined">expand_less</span>
      </div>

      {quote.demo_only && (
        <div className="demo-warning">
          <strong>DEMO — NOT A LIVE FARE</strong>
          <span>Fuel and fare values are synthetic development data.</span>
        </div>
      )}

      <div className="fare-total">
        <div>
          <span>Passenger fare</span>
          <strong>{money(fare.total)}</strong>
          <small>Valid until {new Date(quote.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
        <span className="fare-check material-symbols-outlined">verified</span>
      </div>

      <div className="fare-summary">
        <div>
          <span className="material-symbols-outlined">straighten</span>
          <label>Road distance<strong>{(quote.route.distance_meters / 1000).toFixed(2)} km</strong></label>
        </div>
        <div>
          <span className="material-symbols-outlined">schedule</span>
          <label>Travel time<strong>{Math.ceil(quote.route.duration_seconds / 60)} min</strong></label>
        </div>
        <div>
          <span className="material-symbols-outlined">local_gas_station</span>
          <label>Fuel assumption<strong>₦{quote.fuel.price_ngn_per_litre}/L</strong></label>
        </div>
      </div>

      <div className="fare-lines">
        <div><span>Fuel cost</span><strong>{money(fare.fuel)}</strong></div>
        <div><span>Modeled operating costs</span><strong>{money(fare.modeled_operating_costs)}</strong></div>
        <div><span>Driver gross share</span><strong>{money(fare.driver_gross_share)}</strong></div>
        <div><span>Driver contribution</span><strong>{money(fare.driver_contribution_margin)}</strong></div>
        <div><span>Platform commission</span><strong>{money(fare.commission)}</strong></div>
        <div><span>Fuel consumption</span><strong>{fare.estimated_fuel_consumption_litres || '—'} L</strong></div>
      </div>

      <p className="fare-footnote"><span className="material-symbols-outlined">eco</span>All values are returned by the backend; the frontend does not calculate fares.</p>
    </section>
  );
}

function Driver() {
  return (
    <Shell>
      <main className="page">
        <div className="card grid">
          <span className="pill success">DEMO STATE · no dispatch connected</span>
          <h2>Driver partner dashboard</h2>
          <p>Preserved Stitch driver HUD. Driver onboarding, availability, dispatch, and earnings are not backend endpoints yet.</p>
          <div className="two">
            <div className="metric"><label>Operating city</label><strong>Calabar pilot</strong></div>
            <div className="metric"><label>Trip status</label><strong>Coming soon</strong></div>
          </div>
          <button className="button secondary" disabled>Go online (not connected)</button>
        </div>
      </main>
    </Shell>
  );
}

function Fleet() {
  const [token, setToken] = useState('');
  const [city, setCity] = useState('Calabar');
  const [vehicle, setVehicle] = useState('STANDARD');
  const [distance, setDistance] = useState('6.4');
  const [duration, setDuration] = useState('14');
  const [fuel, setFuel] = useState('1220');
  const [efficiency, setEfficiency] = useState('10');
  const [maintenance, setMaintenance] = useState('65');
  const [margin, setMargin] = useState('300');
  const [commission, setCommission] = useState('0.08');
  const [overhead, setOverhead] = useState('0');
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setResult(null);
    const body: PricingSimulationRequest = {
      city,
      vehicle_class: vehicle,
      distance_km: distance,
      duration_minutes: duration,
      fuel_price_per_litre: fuel,
      fuel_efficiency_km_per_litre: efficiency,
      maintenance_per_km: maintenance,
      minimum_driver_contribution_margin: margin,
      commission_rate: commission,
      pickup_distance_km: '0',
      pickup_time_minutes: '0',
      traffic_delay_minutes: '0',
      operating_overhead_per_km: overhead,
      base_driver_allowance: '500',
      time_allowance_per_minute: '35',
      rounding_increment: '50',
      minimum_trip_fare: '0',
      pickup_allowance: '0',
      tolls: '0',
      payment_costs: '0',
      applicable_taxes: '0',
    };

    try {
      setResult((await simulatePricing(body, token)).fare_breakdown);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">↗</span> ROUTENA</div>
        <span className="pill">DEMO / OPERATIONS</span>
        <nav style={{ marginTop: 28 }}>
          <NavLink className="side-link" to="/fleet">Pricing Simulator</NavLink>
          <span className="side-link">Fuel Index Engine · available</span>
          <span className="side-link">Live Fleet & Trips · coming soon</span>
          <span className="side-link">Payments · not activated</span>
        </nav>
      </aside>

      <main className="dashboard-main">
        <div className="pill live">Operations command · hypothetical modeling</div>
        <h2>Driver earnings simulator</h2>
        <p>Test city and vehicle assumptions without changing stored rules or creating a passenger quote.</p>
        <div className="notice">HYPOTHETICAL SIMULATION — NOT A LIVE QUOTE. Admin authorization is required and the token is used only for this request.</div>

        <form className="simulator-form card grid" onSubmit={run}>
          <div className="grid two">
            <div className="form-field">
              <label>Admin token</label>
              <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Enter admin token" required />
            </div>
            <div className="form-field">
              <label>City</label>
              <input value={city} onChange={(event) => setCity(event.target.value)} />
            </div>
          </div>

          <div className="grid two">
            <div className="form-field">
              <label>Vehicle class</label>
              <select value={vehicle} onChange={(event) => setVehicle(event.target.value)}>
                <option>STANDARD</option>
                <option>PREMIUM</option>
                <option>MOTORCYCLE</option>
              </select>
            </div>
            <div className="form-field">
              <label>Commission rate</label>
              <input type="number" step="0.01" value={commission} onChange={(event) => setCommission(event.target.value)} />
            </div>
          </div>

          <div className="grid two">
            <div className="form-field">
              <label>Distance (km)</label>
              <input type="number" step="0.1" value={distance} onChange={(event) => setDistance(event.target.value)} />
            </div>
            <div className="form-field">
              <label>Duration (minutes)</label>
              <input type="number" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} />
            </div>
          </div>

          <div className="grid two">
            <div className="form-field">
              <label>Fuel price (NGN/L)</label>
              <input type="number" step="1" value={fuel} onChange={(event) => setFuel(event.target.value)} />
            </div>
            <div className="form-field">
              <label>Fuel efficiency (km/L)</label>
              <input type="number" step="0.1" value={efficiency} onChange={(event) => setEfficiency(event.target.value)} />
            </div>
          </div>

          <div className="grid two">
            <div className="form-field">
              <label>Maintenance (NGN/km)</label>
              <input type="number" step="1" value={maintenance} onChange={(event) => setMaintenance(event.target.value)} />
            </div>
            <div className="form-field">
              <label>Minimum driver margin (NGN)</label>
              <input type="number" step="1" value={margin} onChange={(event) => setMargin(event.target.value)} />
            </div>
          </div>

          <div className="form-field">
            <label>Operating overhead (NGN/km)</label>
            <input type="number" step="1" value={overhead} onChange={(event) => setOverhead(event.target.value)} />
          </div>

          <button className="button" type="submit">Run hypothetical simulation</button>
          {error && <div className="notice error">{error}</div>}
        </form>

        {result && (
          <div className="card sim-result">
            <span className="pill success">Hypothetical result · {city} · {vehicle}</span>
            <div className="sim-total">
              <label>Estimated passenger fare</label>
              <strong>₦{Number(result.final_passenger_fare).toLocaleString()}</strong>
            </div>
            <div className="grid two">
              <div className="metric"><label>Driver gross earnings</label><strong>₦{Number(result.driver_gross_earnings).toLocaleString()}</strong></div>
              <div className="metric"><label>Operating costs</label><strong>₦{Number(result.modeled_operating_costs).toLocaleString()}</strong></div>
              <div className="metric"><label>Contribution margin</label><strong>₦{Number(result.driver_contribution_margin).toLocaleString()}</strong></div>
              <div className="metric"><label>Routena commission</label><strong>₦{Number(result.platform_commission).toLocaleString()}</strong></div>
            </div>
            <div className="sim-breakdown">
              {Object.entries(result).map(([key, value]) => (
                <div key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{value}</strong></div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Trip() {
  return (
    <Shell>
      <main className="page">
        <div className="card grid">
          <span className="pill">Stitch live trip tracking</span>
          <h2>End-of-trip release PIN</h2>
          <p>Trip completion and payment settlement are not connected to the backend. This is a preserved design state, not a financial action.</p>
          <div className="map-note">OpenStreetMap route geometry can be displayed here once a trip endpoint exists.</div>
          <div className="pin">• • • • • •</div>
          <button className="button secondary" disabled>Confirm PIN · coming soon</button>
        </div>
      </main>
    </Shell>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/book" element={<Booking />} />
      <Route path="/drive" element={<Driver />} />
      <Route path="/fleet" element={<Fleet />} />
      <Route path="/trip" element={<Trip />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
