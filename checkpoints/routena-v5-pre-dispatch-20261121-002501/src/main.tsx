import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
import { requestQuote, requestRoadRoute, simulatePricing, type Quote, type RoadRoute, type PricingSimulationRequest } from './api';
import { LeafletMap } from './LeafletMap';
import { LocationSearch, sourceLabels } from './LocationSearch';
import { currentQuote, demoStops, swapStops, tripCoordinates, updateStop, validCoordinates, type Coordinates, type Stop, type StopKey, type Stops } from './locations';
import { DriverPortal } from './DriverPortal';
import { DriverReview } from './DriverReview';
import type { DriverSession } from './driverApi';
import './styles.css';
import './driver.css';

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
          <article className="feature-card"><span className="feature-icon" aria-hidden="true">&#8599;</span><div><h3>Road-based estimates</h3><p>See the route, distance and estimated travel time behind your quote.</p></div></article>
          <article className="feature-card"><span className="feature-icon" aria-hidden="true">&#8358;</span><div><h3>Fuel-aware fares</h3><p>See the fuel assumption and operating costs used to price your trip.</p></div></article>
          <article className="feature-card"><span className="feature-icon" aria-hidden="true">&#10003;</span><div><h3>Driver earnings protection</h3><p>Fare rules account for operating costs and a minimum driver margin.</p></div></article>
        </section>
        <footer className="home-footer">Routena &middot; Akanno Tech Labs Limited</footer>
      </main>
    </Shell>
  );
}

function Booking() {
  const [stops, setStops] = useState<Stops>({ pickup: demoStops[0], destination: demoStops[1] });
  const [target, setTarget] = useState<StopKey | null>(null);
  const [search, setSearch] = useState<StopKey | null>(null);
  const [vehicle, setVehicle] = useState('STANDARD');
  const [preview, setPreview] = useState<RoadRoute | null>(null);
  const [routeError, setRouteError] = useState('');
  const [routing, setRouting] = useState(false);
  const [routeAttempt, setRouteAttempt] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const quoteVersion = useRef(0);
  const routeRequest = useRef<AbortController | null>(null);
  const quoteRequest = useRef<AbortController | null>(null);
  const deviceVersion = useRef(0);

  const invalidateQuote = useCallback(() => {
    quoteVersion.current += 1;
    quoteRequest.current?.abort();
    setQuote(null);
    setMessage('');
    setLoading(false);
  }, []);

  const resetRoute = useCallback(() => {
    routeRequest.current?.abort();
    invalidateQuote();
    setPreview(null);
    setRouteError('');
    setRouting(false);
    deviceVersion.current += 1;
    setLocating(false);
    setDeviceMessage('');
  }, [invalidateQuote]);

  const chooseStop = useCallback((key: StopKey, point: Stop | null) => {
    if (point && !validCoordinates(point)) return;
    resetRoute();
    setStops(previous => updateStop(previous, key, point));
    setTarget(point ? null : key);
  }, [resetRoute]);

  const chooseMapPoint = useCallback((key: StopKey, point: Coordinates) => {
    chooseStop(key, { ...point, source: 'map', label: key === 'pickup' ? 'Pinned pickup' : 'Pinned destination' });
  }, [chooseStop]);

  useEffect(() => {
    const coordinates = tripCoordinates(stops);
    if (!coordinates) return;
    const controller = new AbortController();
    routeRequest.current = controller;
    setRouting(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await requestRoadRoute(coordinates, controller.signal);
        if (!controller.signal.aborted) setPreview(result);
      } catch (error) {
        if (!controller.signal.aborted) setRouteError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setRouting(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [stops, routeAttempt]);

  useEffect(() => () => {
    quoteRequest.current?.abort();
    deviceVersion.current += 1;
  }, []);

  useEffect(() => {
    if (!quote) return;
    const timer = window.setTimeout(() => {
      setQuote(null);
      setMessage('This estimate has expired. Request a new fare.');
    }, Math.max(0, Date.parse(quote.expires_at) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [quote]);

  function locatePickup() {
    if (!navigator.geolocation) {
      setDeviceMessage('Device location is unavailable in this browser. Use search or the map.');
      return;
    }
    const version = ++deviceVersion.current;
    setLocating(true);
    setDeviceMessage('');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (version !== deviceVersion.current) return;
      chooseStop('pickup', {
        latitude: coords.latitude, longitude: coords.longitude, source: 'device', label: 'Current device location',
      });
    }, error => {
      if (version !== deviceVersion.current) return;
      setLocating(false);
      setDeviceMessage(error.code === 1
        ? 'Location permission was denied. Use search or place a pickup pin.'
        : 'Could not locate this device. Use search or place a pickup pin.');
    }, { timeout: 10000, maximumAge: 0, enableHighAccuracy: true });
  }

  const coordinates = tripCoordinates(stops);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coordinates || !preview || loading) return;
    const version = ++quoteVersion.current;
    const controller = new AbortController();
    quoteRequest.current = controller;
    setLoading(true);
    setMessage('');
    setQuote(null);
    try {
      const payload = await requestQuote({ ...coordinates, vehicle_class: vehicle }, controller.signal);
      if (controller.signal.aborted) return;
      const next = currentQuote(version, quoteVersion.current, payload, payload.expires_at);
      if (next) setQuote(next);
      else if (version === quoteVersion.current) setMessage('The service returned an expired or invalid estimate. Please try again.');
    } catch (error) {
      if (!controller.signal.aborted && version === quoteVersion.current) setMessage((error as Error).message);
    } finally {
      if (!controller.signal.aborted && version === quoteVersion.current) setLoading(false);
    }
  }

  const shownRoute = quote?.route ?? preview;
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
            <LeafletMap stops={stops} route={shownRoute} target={target} onSelect={chooseMapPoint} />
            <div className="map-picker-tools">
              {(['pickup', 'destination'] as const).map(key => (
                <button type="button" key={key} aria-pressed={target === key}
                  onClick={() => setTarget(target === key ? null : key)}>
                  Pin {key}
                </button>
              ))}
              {shownRoute && <span>{(shownRoute.distance_meters / 1000).toFixed(2)} km &middot; {Math.ceil(shownRoute.duration_seconds / 60)} min</span>}
            </div>
            <p className="map-help" aria-live="polite">{target ? 'Tap the map to set your ' + target + '.' : 'Choose a pin tool or drag an existing marker.'}</p>
          </motion.div>

          <div className="booking-side">
            <motion.form id="journey-form" className="journey-card" onSubmit={submit} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }}>
              <div className="section-head">
                <div>
                  <h2>Your route</h2>
                </div>
                <button className="swap-button" type="button" onClick={() => {
                  resetRoute();
                  setStops(swapStops);
                  setTarget(null);
                }} aria-label="Swap pickup and destination" disabled={!stops.pickup && !stops.destination}>&#8645;</button>
              </div>

              <div className="location-stack">
                {(['pickup', 'destination'] as const).map(key => {
                  const point = stops[key];
                  const label = key === 'pickup' ? 'Pickup' : 'Destination';
                  return (
                    <div className="location-row-v3" key={key}>
                      <span className={'location-dot ' + key + '-dot'} aria-hidden="true"><span /></span>
                      <div className="location-copy">
                        <span className="stop-label">{label}</span>
                        <button className="stop-search" type="button" aria-label={'Search ' + key} onClick={() => setSearch(key)}>
                          {point?.label ?? 'Search or place a pin'}
                        </button>
                        {point && <small>{sourceLabels[point.source]} &middot; {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</small>}
                      </div>
                      {point && <button type="button" className="stop-tool" aria-label={'Clear ' + key} onClick={() => chooseStop(key, null)}>&#215;</button>}
                    </div>
                  );
                })}
              </div>

              <div className="quick-locations">
                <button type="button" onClick={locatePickup} disabled={locating}>{locating ? 'Finding location?' : 'Use my location for pickup'}</button>
                <button type="button" onClick={() => {
                  resetRoute();
                  setStops({ pickup: demoStops[0], destination: demoStops[1] });
                  setTarget(null);
                }}>Use sample route</button>
              </div>
              {deviceMessage && <p className="search-hint" role="status">{deviceMessage}</p>}
              {routing && <p className="search-hint" role="status">Finding the road route?</p>}
              {routeError && <div className="notice error" role="alert">
                {routeError} <button className="retry-button" type="button" onClick={() => {
                  resetRoute();
                  setRouteAttempt(attempt => attempt + 1);
                }}>Retry route</button>
              </div>}
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
                    onClick={() => {
                      if (vehicle === value) return;
                      invalidateQuote();
                      setVehicle(value);
                    }}
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

            {vehicle === 'MOTORCYCLE' && <p className="notice">Moto uses the car road route for this estimate. Motorcycle access and restrictions are unverified.</p>}
            {quote && <QuoteCard quote={quote} />}

            <div className="booking-action">
              <button className="button booking-submit" type="submit" form="journey-form" disabled={loading || !preview || !coordinates}>
                {loading ? 'Getting fare\u2026' : 'Get fare estimate'} <span aria-hidden="true">&#8599;</span>
              </button>
              <p>{!coordinates ? 'Choose two different stops.' : 'Development quote only. No payment or driver dispatch is connected.'}</p>
            </div>

            {message && <div className="notice error" role="alert">{message}</div>}
          </div>
        </div>
        {search && <LocationSearch key={search} title={search} onClose={() => setSearch(null)} onSelect={point => {
          chooseStop(search, point);
          setSearch(null);
        }} />}
      </main>
    </Shell>
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
          <small>Valid until <time dateTime={quote.expires_at}>{new Date(quote.expires_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Lagos' })} WAT</time></small>
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

function OperationsSidebar() {
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">&#8599;</span> ROUTENA</div>
      <span className="pill">DEMO / OPERATIONS</span>
      <nav className="v5-ops-nav" aria-label="Operations">
        <NavLink className="side-link" to="/fleet" end>Pricing Simulator</NavLink>
        <NavLink className="side-link" to="/fleet/drivers" end>Driver Review</NavLink>
        <span className="side-link">Fuel Index Engine &middot; available</span>
        <span className="side-link">Live Fleet &amp; Trips &middot; coming soon</span>
        <span className="side-link">Payments &middot; not activated</span>
      </nav>
    </aside>
  );
}

function Operations({ children }: { children: React.ReactNode }) {
  return <Shell><div className="dashboard"><OperationsSidebar />{children}</div></Shell>;
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
    <Operations>
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
    </Operations>
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
  const [driverSession, setDriverSession] = useState<DriverSession | null>(null);
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/book" element={<Booking />} />
      <Route path="/drive" element={<Shell><DriverPortal session={driverSession} onSession={setDriverSession} /></Shell>} />
      <Route path="/fleet" element={<Fleet />} />
      <Route path="/fleet/drivers" element={<Operations><DriverReview /></Operations>} />
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

