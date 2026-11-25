import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
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

const navigation = [
  { to: '/', label: 'Home', icon: '\u2302' },
  { to: '/book', label: 'Book ride', icon: '\u2197' },
  { to: '/drive', label: 'Drive', icon: '\u25ce' },
  { to: '/fleet', label: 'Fleet', icon: '\u25a6' },
];

function Navigation({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Main navigation">
      {navigation.map(({ to, label, icon }) => (
        <NavLink key={to} className="nav-link" to={to} end>
          <span aria-hidden="true">{icon}</span>{label}
        </NavLink>
      ))}
    </nav>
  );
}

function Header() {
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="Routena home">
        <span className="brand-mark">↗</span>
        <span>ROUTENA</span>
      </Link>
      <Navigation className="desktop-nav" />
      <span className="pilot-label">Calabar pilot</span>
    </header>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell"><Header />{children}<Navigation className="bottom-nav" /></div>;
}

function Landing() {
  return (
    <Shell>
      <main className="page home-page">
        <motion.section className="hero-panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="hero-copy">
            <span className="pilot-label">Calabar, Nigeria</span>
            <h1>Every kilometre.<br /><span className="accent">A fairer fare.</span></h1>
            <p>See what goes into your ride fare, from road distance to fuel and driver earnings.</p>
            <div className="cta-row">
              <Link className="button" to="/book">Get a demo fare <span aria-hidden="true">&#8599;</span></Link>
              <Link className="button secondary" to="/drive">Drive with Routena</Link>
            </div>
          </div>
          <div className="visual-panel">
            <div className="hero-grid" aria-hidden="true" />
            <div className="hero-halo" aria-hidden="true" />
            <motion.img className="hero-vehicle" src="/vehicles/economy.webp" alt="Emerald Routena Economy sedan illustration"
              initial={{ x: 28, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.55 }} />
            <div className="hero-caption">
              <span className="location-dot" aria-hidden="true"><span /></span>
              <div><strong>Airport to Marian Market</strong><small>Sample journey &middot; Calabar</small></div>
              <Link to="/book" aria-label="Plan the sample journey">&#8599;</Link>
            </div>
          </div>
        </motion.section>
        <section className="feature-grid" aria-label="How Routena fares work">
          <article className="feature-card"><span className="feature-icon" aria-hidden="true">?</span><div><h3>Road-based estimates</h3><p>See the route, distance and estimated travel time behind your quote.</p></div></article>
          <article className="feature-card"><span className="feature-icon" aria-hidden="true">&#8358;</span><div><h3>Fuel-aware fares</h3><p>See the fuel assumption and operating costs used to price your trip.</p></div></article>
          <article className="feature-card"><span className="feature-icon" aria-hidden="true">&#10003;</span><div><h3>Driver earnings protection</h3><p>Fare rules account for operating costs and a minimum driver margin.</p></div></article>
        </section>
        <footer className="home-footer">Routena &middot; Akanno Tech Labs Limited</footer>
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
  const requestVersion = useRef(0);
  const sameLocation = pickup === destination;

  function changeSelection(update: (value: string) => void, value: string) {
    requestVersion.current += 1;
    update(value);
    setQuote(null);
    setMessage('');
    setLoading(false);
  }

  function swapLocations() {
    changeSelection(setPickup, destination);
    setDestination(pickup);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sameLocation || loading) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setMessage('');
    setQuote(null);
    try {
      const payload = await requestQuote({
        pickup: testLocations[pickup],
        destination: testLocations[destination],
        vehicle_class: vehicle,
      });
      if (version === requestVersion.current) setQuote(payload);
    } catch (error) {
      if (version !== requestVersion.current) return;
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
      if (version === requestVersion.current) setLoading(false);
    }
  }

  return (
    <Shell>
      <main className="booking-page-v3">
        <div className="booking-intro">
          <span className="pilot-label">Calabar demo</span>
          <h1>Plan your ride</h1>
          <p>Choose your stops and ride type to see a fuel-aware fare estimate.</p>
        </div>
        <div className="booking-shell">
          <motion.div className="map-panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <LeafletMap pickup={testLocations[pickup]} destination={testLocations[destination]} polyline={quote?.route.polyline} demo={quote?.demo_only} />
          </motion.div>

          <div className="booking-side">
            <motion.form id="journey-form" className="journey-card" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }}>
              <div className="section-head">
                <div>
                  <h2>Your route</h2>
                </div>
                <button className="swap-button" type="button" onClick={swapLocations} aria-label="Swap pickup and destination" disabled={sameLocation}>&#8645;</button>
              </div>

              <div className="location-stack">
                <div className="location-row-v3">
                  <span className="location-dot pickup-dot" aria-hidden="true"><span /></span>
                  <div className="location-copy">
                    <label htmlFor="pickup">Pickup</label>
                    <select id="pickup" value={pickup} onChange={(event) => changeSelection(setPickup, event.target.value)}>
                      {Object.keys(testLocations).map((location) => (
                        <option key={location} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="location-row-v3">
                  <span className="location-dot destination-dot" aria-hidden="true"><span /></span>
                  <div className="location-copy">
                    <label htmlFor="destination">Destination</label>
                    <select id="destination" value={destination} onChange={(event) => changeSelection(setDestination, event.target.value)}>
                      {Object.keys(testLocations).map((location) => (
                        <option key={location} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="quick-locations">
                <span>Quick stops</span>
                <button type="button" onClick={() => changeSelection(setDestination, 'University of Calabar')}>UNICAL</button>
                <button type="button" onClick={() => changeSelection(setDestination, 'Marian Market')}>Marian</button>
                <button type="button" onClick={() => changeSelection(setPickup, 'Margaret Ekpo International Airport')}>Airport</button>
              </div>
            </motion.form>

            <motion.section className="vehicle-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }}>
              <div className="section-head">
                <div>
                  <h2>Choose your ride</h2>
                </div>
                <span className="mini-badge demo">Demo options</span>
              </div>

              <div className="vehicle-options">
                {[
                  ['STANDARD', 'Economy', 'Compact cars and sedans', 'economy'],
                  ['PREMIUM', 'Comfort', 'Premium sedans and crossovers', 'comfort'],
                  ['MOTORCYCLE', 'Moto', 'Motorcycle for short trips', 'moto'],
                ].map(([value, name, description, image]) => (
                  <motion.button
                    type="button"
                    key={value}
                    className={`vehicle-option ${vehicle === value ? 'selected' : ''}`}
                    aria-pressed={vehicle === value}
                    onClick={() => vehicle !== value && changeSelection(setVehicle, value)}
                  >
                    <img className="vehicle-art" src={`/vehicles/${image}.webp`} alt="" />
                    <span className="vehicle-copy">
                      <strong>{name}</strong>
                      <small>{description}</small>
                    </span>
                    <span className="vehicle-radio" aria-hidden="true" />
                  </motion.button>
                ))}
              </div>
            </motion.section>

            {quote && <QuoteCard quote={quote} />}

            <div className="booking-action">
              <button className="button booking-submit" type="submit" form="journey-form" disabled={loading || sameLocation}>
                {loading ? 'Getting fare\u2026' : 'Get fare estimate'} <span aria-hidden="true">&#8599;</span>
              </button>
              <p>{sameLocation ? 'Choose different pickup and destination stops.' : 'Development quote only. No payment or driver dispatch is connected.'}</p>
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

function LeafletMap({ pickup, destination, polyline, demo }: {
  pickup: Coordinates; destination: Coordinates; polyline?: string; demo?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);

  const mapRef = useRef<L.Map | null>(null);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);

  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current, { scrollWheelZoom: false, zoomControl: false })
      .setView([5.03, 8.33], 14);
    mapRef.current = map;
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).on('tileerror', () => setTilesUnavailable(true))
      .on('tileload', () => setTilesUnavailable(false))
      .addTo(map);

    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(element.current);
    return () => {
      resize.disconnect();
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const stops: [L.LatLngTuple, L.LatLngTuple] = [
      [pickup.latitude, pickup.longitude], [destination.latitude, destination.longitude],
    ];
    const layers = L.featureGroup().addTo(map);
    const points = polyline ? decodePolyline(polyline) : [];

    if (points.length > 1) {
      L.polyline(points, { color: '#fff', weight: 10 }).addTo(layers);
      L.polyline(points, { color: '#0879ee', weight: 5 }).addTo(layers);
    }

    stops.forEach((point, index) => {
      const label = index === 0 ? 'Pickup' : 'Destination';
      const icon = L.divIcon({
        className: `map-pin map-pin-${index}`,
        iconSize: [26, 26],
        html: index === 0 ? 'A' : 'B',
      });
      L.marker(point, { icon, title: label }).bindTooltip(label).addTo(layers);
    });

    map.fitBounds(layers.getBounds(), { padding: [46, 54], maxZoom: 15, animate: false });
    return () => { layers.remove(); };
  }, [pickup, destination, polyline]);

  return (
    <div className="map-frame booking-map-frame">
      <div ref={element} className="leaflet-map" aria-label="Map of selected stops in Calabar" />
      <div className="map-route-pill"><span />{polyline ? (demo ? 'Demo road route' : 'Road route') : 'Selected stops'}</div>
      {tilesUnavailable && <small className="map-attribution-note">Map tiles unavailable</small>}
    </div>
  );
}

function QuoteCard({ quote }: { quote: Quote }) {
  const fare = quote.fare_breakdown;
  const litres = Number(fare.estimated_fuel_consumption_litres);
  const money = (value?: string) => {
    if (value === undefined || value === null || value === '') return '—';
    const number = Number(value);
    return Number.isFinite(number) ? `₦${number.toLocaleString('en-NG', { maximumFractionDigits: 2 })}` : '—';
  };

  return (
    <motion.section className="fare-card" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="fare-card-header">
        <div className="fare-icon" aria-hidden="true">&#8358;</div>
        <div>
          <h2>Transparent fare</h2>
          <p>{quote.city} pilot · backend-calculated</p>
        </div>
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
          <strong>{money(fare.total ?? fare.final_passenger_fare)}</strong>
          <small>Valid until {new Date(quote.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })} WAT</small>
        </div>

      </div>

      <div className="fare-summary">
        <div>
          
          <div className="fare-stat">Road distance<strong>{(quote.route.distance_meters / 1000).toFixed(2)} km</strong></div>
        </div>
        <div>
          
          <div className="fare-stat">Travel time<strong>{Math.ceil(quote.route.duration_seconds / 60)} min</strong></div>
        </div>
        <div>
          
          <div className="fare-stat">Fuel assumption<strong>{money(quote.fuel.price_ngn_per_litre)}/L</strong></div>
        </div>
      </div>

      <div className="fare-lines">
        <div><span>Fuel cost</span><strong>{money(fare.fuel ?? fare.fuel_cost)}</strong></div>
        <div><span>Modeled operating costs</span><strong>{money(fare.modeled_operating_costs)}</strong></div>
        <div><span>Driver gross share</span><strong>{money(fare.driver_gross_share ?? fare.driver_gross_earnings)}</strong></div>
        <div><span>Driver contribution</span><strong>{money(fare.driver_contribution_margin)}</strong></div>
        <div><span>Platform commission</span><strong>{money(fare.commission ?? fare.platform_commission)}</strong></div>
        <div><span>Fuel consumption</span><strong>{Number.isFinite(litres) ? litres.toLocaleString('en-NG', { maximumFractionDigits: 3 }) + ' L' : '—'}</strong></div>
      </div>

      <p className="fare-footnote">Calculated by the Routena fare engine.</p>
    </motion.section>
  );
}

function Driver() {
  return (
    <Shell>
      <main className="page">
        <div className="card grid">
          <span className="pill success">DEMO STATE · no dispatch connected</span>
          <h2>Driver partner dashboard</h2>
          <p>Preserved Stitch driver HUD. Driver onboarding, availability, dispatch, and earnings are not backed by live endpoints yet.</p>
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
    <Shell>
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
    </Shell>
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
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

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
      <MotionConfig reducedMotion="user"><App /></MotionConfig>
    </BrowserRouter>
  </React.StrictMode>
);

