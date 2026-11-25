import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MotionConfig, motion, AnimatePresence } from 'framer-motion';
import {
  requestQuote, requestRoadRoute, simulatePricing, quickPassengerSession,
  createRide, getCurrentRide, cancelRide, driverAction, setDriverAvailability,
  baseUrl, type Quote, type RoadRoute, type PricingSimulationRequest, type Ride
} from './api';
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
            <span className="pilot-label">Calabar, Nigeria &middot; Pilot</span>
            <h1>Real fuel prices.<br /><span className="accent">Safe 6-digit escrow.</span></h1>
            <p>
              Nigeria’s first mobility platform built for the fuel-subsidy reality. Every trip checks verified petrol station pump prices per kilometre, locks passenger fares in safe escrow, and releases instant payouts upon entering your 6-digit destination code.
            </p>
            <div className="cta-row">
              <Link className="button" to="/book">Calculate Fair Ride <span aria-hidden="true">&#8599;</span></Link>
              <Link className="button secondary" to="/drive">Driver Console &middot; 8% Fee</Link>
            </div>
          </div>
          <div className="visual-panel">
            <div className="hero-grid" aria-hidden="true" />
            <div className="hero-halo" aria-hidden="true" />
            <motion.img className="hero-vehicle" src="/vehicles/economy.webp" alt="Emerald Routena Economy sedan illustration"
              initial={{ x: 28, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.55 }} />
            <div className="hero-caption">
              <span className="location-dot" aria-hidden="true"><span /></span>
              <div><strong>Airport to Marian Market</strong><small>PMS ₦1,220/L Indexed &middot; 6-Digit Handover</small></div>
              <Link to="/book" aria-label="Plan the sample journey">&#8599;</Link>
            </div>
          </div>
        </motion.section>
        <section className="feature-grid" aria-label="How Routena fares work">
          <article className="feature-card">
            <span className="feature-icon" aria-hidden="true">⛽</span>
            <div>
              <h3>Fuel-Indexed Per-KM Pricing</h3>
              <p>Fares calculate real fuel consumption based on live verified station pump prices, ending off-app negotiations.</p>
            </div>
          </article>
          <article className="feature-card">
            <span className="feature-icon" aria-hidden="true">🛡️</span>
            <div>
              <h3>6-Digit In-App Escrow Handover</h3>
              <p>Passengers pay upfront into secure escrow. Drivers are only paid when you reach your destination and share your 6-digit code.</p>
            </div>
          </article>
          <article className="feature-card">
            <span className="feature-icon" aria-hidden="true">⚡</span>
            <div>
              <h3>Instant 8% Commission Payout</h3>
              <p>Drivers keep 92% of gross earnings. Payouts credit instantly to the driver wallet the second the 6-digit PIN is entered.</p>
            </div>
          </article>
        </section>
        <footer className="home-footer">Routena &middot; Akanno Tech Labs Limited</footer>
      </main>
    </Shell>
  );
}

function Booking() {
  const navigate = useNavigate();
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
  const [bookingRide, setBookingRide] = useState(false);
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
  async function handlePayAndBook() {
    if (!quote || !coordinates) return;
    setBookingRide(true);
    setMessage('');
    try {
      let token = localStorage.getItem('routena_passenger_token');
      if (!token) {
        const session = await quickPassengerSession();
        token = session.access_token;
        localStorage.setItem('routena_passenger_token', token);
      }
      const newRide = await createRide(quote.quote_id, coordinates.pickup, coordinates.destination, vehicle, token);
      navigate('/trip', { state: { ride: newRide, token } });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBookingRide(false);
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
            
            {quote && (
              <QuoteCard
                quote={quote}
                onPayAndBook={handlePayAndBook}
                bookingRide={bookingRide}
              />
            )}

            {!quote && (
              <div className="booking-action">
                <button className="button booking-submit" type="submit" form="journey-form" disabled={loading || !preview || !coordinates}>
                  {loading ? 'Calculating Fair Fare\u2026' : 'Calculate Fuel-Indexed Fare'} <span aria-hidden="true">&#8599;</span>
                </button>
                <p>{!coordinates ? 'Choose two different stops.' : 'Verified live fuel price & route engine.'}</p>
              </div>
            )}

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

function QuoteCard({
  quote,
  onPayAndBook,
  bookingRide,
}: {
  quote: Quote;
  onPayAndBook: () => void;
  bookingRide: boolean;
}) {
  const fare = quote.fare_breakdown;
  const litres = Number(fare.estimated_fuel_consumption_litres);
  const money = (value?: string) => {
    if (value === undefined || value === null || value === '') return '—';
    const number = Number(value);
    return Number.isFinite(number) ? `₦${number.toLocaleString('en-NG', { maximumFractionDigits: 2 })}` : '—';
  };

  return (
    <motion.section className="fare-card" role="status" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div className="fuel-live-pill">
          <span className="fuel-icon">⛽</span> PMS {money(quote.fuel.price_ngn_per_litre)}/L · Live Pump Indexed
        </div>
        <span className="pill success" style={{ background: 'rgba(28, 162, 105, 0.12)', color: 'var(--success)' }}>
          🛡️ Safe Escrow
        </span>
      </div>

      <div className="fare-card-header">
        <div className="fare-icon" aria-hidden="true">&#8358;</div>
        <div>
          <h2>Transparent Fare Breakdown</h2>
          <p>{quote.city} pilot &middot; Calculated per-kilometre with fuel index</p>
        </div>
      </div>

      <div className="fare-total">
        <div>
          <span>Locked Escrow Fare</span>
          <strong>{money(fare.total ?? fare.final_passenger_fare)}</strong>
          <small>Valid until <time dateTime={quote.expires_at}>{new Date(quote.expires_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Lagos' })} WAT</time></small>
        </div>
      </div>

      <div className="fare-summary">
        <div>
          <div className="fare-stat">Road distance<strong>{(quote.route.distance_meters / 1000).toFixed(2)} km</strong></div>
        </div>
        <div>
          <div className="fare-stat">Est. travel time<strong>{Math.ceil(quote.route.duration_seconds / 60)} min</strong></div>
        </div>
        <div>
          <div className="fare-stat">Est. Fuel Needed<strong>{Number.isFinite(litres) ? litres.toFixed(2) + ' L' : '—'}</strong></div>
        </div>
      </div>

      <div className="fare-lines">
        <div><span>⛽ Real Fuel Cost</span><strong>{money(fare.fuel ?? fare.fuel_cost)}</strong></div>
        <div><span>🔧 Vehicle Maintenance</span><strong>{money(fare.maintenance ?? fare.maintenance_allowance)}</strong></div>
        <div><span>🚗 Driver Gross Share (92%)</span><strong style={{ color: 'var(--primary)' }}>{money(fare.driver_gross_share ?? fare.driver_gross_earnings)}</strong></div>
        <div><span>📈 Driver Contribution Margin</span><strong style={{ color: 'var(--success)' }}>+{money(fare.driver_contribution_margin)}</strong></div>
        <div><span>⚡ Routena Platform Fee (Fair 8%)</span><strong>{money(fare.commission ?? fare.platform_commission)}</strong></div>
      </div>

      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
        <button
          type="button"
          className="button"
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            fontWeight: 800,
            background: 'linear-gradient(180deg, #13d59d 0%, #0c8b66 100%)',
            boxShadow: '0 12px 28px rgba(12, 107, 79, 0.28)',
          }}
          onClick={onPayAndBook}
          disabled={bookingRide}
        >
          {bookingRide ? 'Locking in Escrow…' : `Pay & Lock Escrow (${money(fare.total ?? fare.final_passenger_fare)}) ↗`}
        </button>
        <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '10px', textAlign: 'center', lineHeight: 1.4 }}>
          🔒 Your payment is held safely in escrow. You will receive a <strong>6-digit handover code</strong> to give the driver only after arriving at your destination.
        </p>
      </div>
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
  const location = useLocation();
  const navigate = useNavigate();
  const [ride, setRide] = useState<Ride | null>(location.state?.ride || null);
  const [token, setToken] = useState<string>(location.state?.token || localStorage.getItem('routena_passenger_token') || '');
  const [copied, setCopied] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [simMessage, setSimMessage] = useState('');

  // Fetch or refresh active ride
  const refreshRide = async () => {
    if (!token) return;
    try {
      const current = await getCurrentRide(token);
      if (current) setRide(current);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!token) {
      quickPassengerSession().then(s => {
        setToken(s.access_token);
        localStorage.setItem('routena_passenger_token', s.access_token);
      }).catch(console.error);
    }
  }, [token]);

  useEffect(() => {
    refreshRide();
    const timer = setInterval(refreshRide, 2500);
    return () => clearInterval(timer);
  }, [token]);

  const copyPin = () => {
    if (ride?.escrow_pin) {
      navigator.clipboard.writeText(ride.escrow_pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCancel = async () => {
    if (!ride || !token) return;
    setBusy(true);
    try {
      const res = await cancelRide(ride.id, token);
      setRide(res);
    } catch (e) {
      setSimMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Automated simulation helper so anyone testing the frontend can advance the trip
  const simulateDriverProgress = async () => {
    if (!ride || !token) return;
    setBusy(true);
    setSimMessage('');
    try {
      const loginRes = await fetch(`${baseUrl}/api/v1/dispatch/driver/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer driver-demo-token' }
      }).catch(() => null);

      // We can use the driver endpoint via driver login or direct test trigger
      const driverTokenRes = await fetch(`${baseUrl}/api/v1/driver/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'driver@routena.test', password: 'DriverDemo2026!' })
      });
      const driverAuth = await driverTokenRes.json();
      const dToken = driverAuth.access_token;

      // Bring driver online if not already
      await setDriverAvailability(true, 'Margaret Ekpo Airport', dToken).catch(() => {});

      if (ride.status === 'OFFERED') {
        await driverAction(ride.id, 'accept', 'OFFERED', dToken);
        setSimMessage('Driver accepted the offer!');
      } else if (ride.status === 'ACCEPTED') {
        await driverAction(ride.id, 'advance', 'ACCEPTED', dToken);
        setSimMessage('Driver is arriving at pickup location.');
      } else if (ride.status === 'DRIVER_ARRIVING') {
        await driverAction(ride.id, 'advance', 'DRIVER_ARRIVING', dToken);
        setSimMessage('Driver arrived at pickup!');
      } else if (ride.status === 'DRIVER_ARRIVED') {
        await driverAction(ride.id, 'advance', 'DRIVER_ARRIVED', dToken);
        setSimMessage('Trip started towards destination!');
      } else if (ride.status === 'IN_PROGRESS') {
        await driverAction(ride.id, 'advance', 'IN_PROGRESS', dToken, ride.escrow_pin);
        setSimMessage('Handover PIN verified! Payout released to driver wallet.');
      }
      await refreshRide();
    } catch (e) {
      setSimMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!ride) {
    return (
      <Shell>
        <main className="page" style={{ textAlign: 'center', padding: '120px 20px' }}>
          <motion.div className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: '500px', margin: '0 auto', padding: '40px 24px' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🚕</span>
            <h2>No Active Trip</h2>
            <p className="v5-muted">You do not have a ride currently locked in escrow. Plan a journey to see transparent fuel pricing and your 6-digit safe handover code.</p>
            <Link to="/book" className="button" style={{ marginTop: '20px', display: 'inline-block' }}>
              Book a Ride ↗
            </Link>
          </motion.div>
        </main>
      </Shell>
    );
  }

  const stepsList = [
    { key: 'SEARCHING', label: 'Finding Driver', active: ['REQUESTED', 'SEARCHING'].includes(ride.status) },
    { key: 'ARRIVING', label: 'Driver Arriving', active: ['OFFERED', 'ACCEPTED', 'DRIVER_ARRIVING'].includes(ride.status) },
    { key: 'ARRIVED', label: 'At Pickup', active: ride.status === 'DRIVER_ARRIVED' },
    { key: 'IN_PROGRESS', label: 'On Trip', active: ride.status === 'IN_PROGRESS' },
    { key: 'COMPLETED', label: 'Completed', active: ride.status === 'COMPLETED_DEMO' },
  ];

  const currentStepIdx = ride.status === 'COMPLETED_DEMO' ? 4
    : ride.status === 'IN_PROGRESS' ? 3
    : ride.status === 'DRIVER_ARRIVED' ? 2
    : ['ACCEPTED', 'DRIVER_ARRIVING', 'OFFERED'].includes(ride.status) ? 1 : 0;

  const pinDigits = (ride.escrow_pin || '••••••').split('');

  return (
    <Shell>
      <main className="page" style={{ maxWidth: '980px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span className="pilot-label">Calabar &middot; Live Trip &amp; Handover</span>
            <h1 style={{ margin: '4px 0 0' }}>Safe In-App Escrow Trip</h1>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span className="fuel-live-pill">
              <span className="fuel-icon">⛽</span> Fuel-Indexed
            </span>
            <span className="pill success" style={{ background: '#eafaf3', color: '#1ca269', fontWeight: 800 }}>
              🛡️ Escrow Active
            </span>
          </div>
        </div>

        {/* Stepper */}
        <div className="trip-status-stepper">
          {stepsList.map((step, idx) => (
            <div
              key={step.key}
              className={`trip-step-item ${idx === currentStepIdx ? 'active' : ''} ${idx < currentStepIdx ? 'completed' : ''}`}
            >
              <div className="step-circle">
                {idx < currentStepIdx ? '✓' : idx + 1}
              </div>
              <span className="step-text">{step.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
          {/* Left Column: Escrow Shield & Driver Details */}
          <div>
            {/* 6-DIGIT ESCROW CODE SHIELD CARD */}
            <motion.div
              className="escrow-shield-card"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="escrow-header">
                <span className="escrow-badge">🔒 In-App Escrow Shield</span>
                <span className="escrow-amount-tag">₦{Number(ride.escrow_amount_ngn || ride.fare_ngn).toLocaleString()}</span>
              </div>

              <div className="pin-display-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="pin-label" style={{ margin: 0 }}>Your 6-Digit Handover Code</span>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.16)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {showPin ? '🔒 Hide Code' : '👁️ Reveal Code'}
                  </button>
                </div>
                <div className="pin-boxes">
                  {pinDigits.map((char, index) => (
                    <motion.div
                      key={index}
                      className="pin-box"
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: index * 0.04 }}
                    >
                      {showPin || ride.status === 'COMPLETED_DEMO' ? char : '•'}
                    </motion.div>
                  ))}
                </div>
                <button type="button" className="copy-pin-btn" onClick={copyPin}>
                  {copied ? '✓ Code Copied!' : '📋 Copy 6-Digit PIN'}
                </button>
              </div>

              <div className="pin-instruction">
                <strong>Important Security Notice:</strong>
                <p style={{ margin: '4px 0 0' }}>
                  Do NOT give this code to your driver until you arrive safely at your destination. When the driver inputs this code into their app, trip completion is verified and their earnings are instantly released from escrow.
                </p>
              </div>
            </motion.div>

            {/* Driver Profile Card */}
            {ride.driver ? (
              <motion.div
                className="v5-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ marginBottom: '20px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#eef8f3', display: 'grid', placeItems: 'center', fontSize: '24px' }}>
                    👨🏾‍✈️
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 4px' }}>{ride.driver.name}</h3>
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '14px' }}>
                      {ride.driver.colour} {ride.driver.vehicle} &middot; <strong>{ride.driver.plate}</strong>
                    </p>
                    <small style={{ color: 'var(--primary)', fontWeight: 700 }}>⭐ 4.95 Rating &middot; Verified Partner</small>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="v5-card" style={{ textAlign: 'center', padding: '24px', marginBottom: '20px' }}>
                <div className="radar-spinner" style={{ marginBottom: '12px' }} />
                <h4>Matching Nearby Driver…</h4>
                <p className="v5-muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
                  Locating verified Calabar drivers near your pickup location.
                </p>
              </div>
            )}

            {/* Financial & Fuel Breakdown */}
            <div className="v5-card" style={{ marginBottom: '20px' }}>
              <h4>Transparent Economics</h4>
              <div className="fare-lines" style={{ marginTop: '12px' }}>
                <div><span>Passenger Fare (Locked in Escrow)</span><strong>₦{Number(ride.escrow_amount_ngn || ride.fare_ngn).toLocaleString()}</strong></div>
                <div><span>Driver Gross Payout (92%)</span><strong style={{ color: 'var(--primary)' }}>₦{Number(ride.driver_payout_ngn || '0').toLocaleString()}</strong></div>
                <div><span>Routena Commission (Fair 8%)</span><strong>₦{Number(ride.platform_fee_ngn || '0').toLocaleString()}</strong></div>
                <div><span>Escrow Status</span><strong style={{ color: ride.status === 'COMPLETED_DEMO' ? 'var(--success)' : '#0b7dff' }}>{ride.payout_status || 'HELD_IN_ESCROW'}</strong></div>
              </div>
            </div>

            {/* Interactive Simulation Console */}
            <div className="v5-card" style={{ background: '#f8fbfa', border: '1px dashed #b2ded0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Demo Simulation Console</strong>
                <Link to="/drive" target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 700 }}>
                  Open Driver App in New Tab ↗
                </Link>
              </div>
              <p className="v5-muted" style={{ fontSize: '13px', margin: '6px 0 12px' }}>
                Experience the driver flow directly, or click below to simulate driver actions:
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ride.status !== 'COMPLETED_DEMO' && (
                  <button
                    type="button"
                    className="button"
                    style={{ fontSize: '13px', padding: '10px 16px' }}
                    onClick={simulateDriverProgress}
                    disabled={busy}
                  >
                    {busy ? 'Processing…' : ride.status === 'IN_PROGRESS' ? '🏁 Simulate Destination Arrival & PIN Input' : '⚡ Advance Driver Step'}
                  </button>
                )}

                {['REQUESTED', 'SEARCHING', 'OFFERED', 'ACCEPTED', 'DRIVER_ARRIVING'].includes(ride.status) && (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ fontSize: '13px', padding: '10px 16px' }}
                    onClick={handleCancel}
                    disabled={busy}
                  >
                    Cancel Ride
                  </button>
                )}
              </div>

              {simMessage && <p style={{ fontSize: '12px', color: 'var(--primary-deep)', marginTop: '8px', fontWeight: 600 }}>{simMessage}</p>}
            </div>
          </div>

          {/* Right Column: Route Map & Live Status */}
          <div>
            <div className="map-panel" style={{ height: '420px', borderRadius: '20px', overflow: 'hidden' }}>
              <LeafletMap
                stops={{
                  pickup: { latitude: ride.pickup.latitude, longitude: ride.pickup.longitude, label: 'Pickup Point', source: 'map' },
                  destination: { latitude: ride.destination.latitude, longitude: ride.destination.longitude, label: 'Destination', source: 'map' },
                }}
                route={ride.route}
                target={null}
                onSelect={() => {}}
              />
            </div>

            {ride.status === 'COMPLETED_DEMO' && (
              <motion.div
                className="instant-payout-celebration"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ marginTop: '20px' }}
              >
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎉</div>
                <h2>Trip Completed Safely!</h2>
                <p style={{ margin: '8px 0 16px', opacity: 0.95 }}>
                  The 6-digit code was verified by your driver at destination. Escrow funds have been released to the driver's wallet.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <Link to="/book" className="button" style={{ background: '#ffffff', color: 'var(--primary-deep)', fontWeight: 800 }}>
                    Book Another Ride ↗
                  </Link>
                </div>
              </motion.div>
            )}
          </div>
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

