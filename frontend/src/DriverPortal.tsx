import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { driverApi, driverError, DriverApiError, field, statusLabels, type Application, type City, type DriverSession } from './driverApi';
import { ApplicationSummary, DocumentFields, InputField, ProfileFields, VehicleFields, profileInput, vehicleInput } from './DriverForms';
import { getDriverStatus, setDriverAvailability, driverAction, type DriverStatus } from './api';

const steps = ['Profile', 'Vehicle', 'Documents', 'Review'] as const;
type Step = typeof steps[number];
const statusCopy = {
  DRAFT: 'Complete the steps and submit your demo application.',
  PENDING_REVIEW: 'Your demo application is with the operations team.',
  MORE_INFORMATION_REQUIRED: 'Update your application using the reviewer feedback, then submit it again.',
  APPROVED: 'Your demo application and vehicle have been approved.',
  REJECTED: 'The operations team rejected this demo application. See the feedback for details.',
  SUSPENDED: 'Your demo approval is suspended. See the feedback for details.',
};

export function DriverPortal({ session, onSession }: { session: DriverSession | null; onSession: (value: DriverSession | null) => void }) {
  const [screen, setScreen] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [cities, setCities] = useState<City[] | null>(null);
  const [cityError, setCityError] = useState('');
  const [cityRetry, setCityRetry] = useState(0);
  const [application, setApplication] = useState<Application | null>(null);
  const [step, setStep] = useState<Step>('Profile');
  const [busy, setBusy] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileRetry, setProfileRetry] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const action = useRef<AbortController | null>(null);
  const activeSession = useRef(session);
  activeSession.current = session;

  useEffect(() => {
    const controller = new AbortController();
    setCityError('');
    setCities(null);
    driverApi.cities(controller.signal).then(result => {
      if (!controller.signal.aborted) setCities(result);
    }).catch(reason => {
      if (!controller.signal.aborted) setCityError(driverError(reason));
    });
    return () => controller.abort();
  }, [cityRetry]);

  useEffect(() => {
    if (!session) { setApplication(null); setLoadingProfile(false); return; }
    const controller = new AbortController();
    function expire() {
      controller.abort();
      action.current?.abort();
      action.current = null;
      setBusy(false);
      setNotice('');
      setScreen('login');
      onSession(null);
      setError('Your session expired. Sign in again to continue.');
    }
    if (session.expiresAt <= Date.now()) { expire(); return; }
    const timer = window.setTimeout(expire, session.expiresAt - Date.now());
    setLoadingProfile(true);
    driverApi.profile(session.token, controller.signal).then(result => {
      if (!controller.signal.aborted) setApplication(result);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      if (reason instanceof DriverApiError && reason.status === 401) expire();
      else setError(driverError(reason));
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingProfile(false);
    });
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [session, profileRetry, onSession]);

  useEffect(() => () => action.current?.abort(), []);

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (action.current) return;
    const controller = new AbortController();
    action.current = controller;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task(controller.signal);
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (activeSession.current && reason instanceof DriverApiError && reason.status === 401) {
        setScreen('login');
        onSession(null);
        setError('Your session expired. Sign in again to continue.');
      } else setError(driverError(reason));
    } finally {
      if (action.current === controller) {
        action.current = null;
        setBusy(false);
      }
    }
  }

  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const login = { email: field(data, 'email').trim(), password: field(data, 'password') };
    void run(async signal => {
      if (screen === 'register') {
        await driverApi.register({ ...profileInput(data), ...login, demo_acknowledged: true }, signal);
        if (signal.aborted) return;
        setEmail(login.email);
        setScreen('login');
        setNotice('Demo account created. Sign in to continue your application.');
      } else {
        const result = await driverApi.login(login, signal);
        if (signal.aborted) return;
        setStep('Profile');
        onSession({ token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 });
      }
    });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const data = new FormData(event.currentTarget);
    void run(async signal => {
      const { token } = session;
      let result: Application;
      switch (step) {
        case 'Profile': result = await driverApi.saveProfile(token, profileInput(data), signal); break;
        case 'Vehicle': result = await driverApi.saveVehicle(token, vehicleInput(data), signal); break;
        case 'Documents': result = await driverApi.saveDocuments(token, {
          licence_placeholder: field(data, 'licence_placeholder').trim(),
          vehicle_documents_ready: data.has('vehicle_documents_ready'),
        }, signal); break;
        case 'Review': result = await driverApi.submit(token, signal); break;
      }
      if (signal.aborted) return;
      setApplication(result);
      if (step === 'Review') setNotice('Your demo application was submitted for review.');
      else {
        setStep(steps[steps.indexOf(step) + 1]);
        setNotice(step + ' saved.');
      }
    });
  }

  function logout() {
    if (!session) return;
    void run(async signal => {
      await driverApi.logout(session.token, signal);
      if (signal.aborted) return;
      onSession(null);
      setScreen('login');
      setNotice('Signed out.');
    });
  }

  const messages = <>
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="v5-success" role="status">{notice}</p>}
  </>;
  const cityFeedback = <>
    {cities === null && !cityError && <p role="status" className="v5-muted">Loading operating cities&hellip;</p>}
    {cities?.length === 0 && <p className="notice">No operating city is available for demo registration.</p>}
    {cityError && <p className="notice error" role="alert">{cityError} <button className="v5-text-button" type="button" onClick={() => setCityRetry(value => value + 1)}>Retry</button></p>}
  </>;

  if (!session) {
    return (
      <main className="page v5-page v5-guest">
        <motion.section className="v5-welcome" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <span className="pilot-label">Routena driver partners</span>
          <h1>Your road.<br /><span className="accent">Your next move.</span></h1>
          <p>Build a driver profile, register a vehicle, and follow your application from draft to review.</p>
          <figure className="v5-vehicle-hero"><img src="/vehicles/economy.webp" alt="Emerald Routena sedan illustration" /></figure>
          <div className="v5-welcome-footer"><span>Calabar pilot</span><span>Synthetic demo</span></div>
        </motion.section>
        <section className="v5-card v5-auth" aria-labelledby="driver-auth">
          <div className="v5-tabs" aria-label="Driver account">
            <button type="button" aria-pressed={screen === 'register'} disabled={busy} onClick={() => { setScreen('register'); setError(''); setNotice(''); }}>Create account</button>
            <button type="button" aria-pressed={screen === 'login'} disabled={busy} onClick={() => { setScreen('login'); setError(''); setNotice(''); }}>Sign in</button>
          </div>
          <h2 id="driver-auth">{screen === 'register' ? 'Start your application' : 'Welcome back'}</h2>
          <p className="v5-muted">{screen === 'register' ? 'Use synthetic details and a .test email for this local demo.' : 'Sign in to continue or check your demo review status.'}</p>
          {screen === 'register' && cityFeedback}
          {messages}
          <form key={screen} onSubmit={authenticate}>
            <fieldset className="v5-form" disabled={busy}>
              {screen === 'register' && <ProfileFields cities={cities ?? []} />}
              <InputField label="Demo email"><input type="email" name="email" defaultValue={email} autoComplete="username"
                placeholder="driver@routena.test" pattern={screen === 'register' ? '.+\\.[tT][eE][sS][tT]' : undefined} maxLength={254} required /></InputField>
              <InputField label="Password"><input type="password" name="password" autoComplete={screen === 'register' ? 'new-password' : 'current-password'}
                minLength={screen === 'register' ? 12 : undefined} maxLength={128} required /></InputField>
              {screen === 'register' && <label className="v5-check"><input type="checkbox" required name="demo_acknowledged" /><span>I am using synthetic information for this demo.</span></label>}
              <button className="button v5-submit" type="submit" disabled={screen === 'register' && !cities?.length}>
                {busy ? 'Please wait…' : screen === 'register' ? 'Create demo account' : 'Sign in'}
              </button>
            </fieldset>
          </form>
        </section>
      </main>
    );
  }

  const editable = application?.status === 'DRAFT' || application?.status === 'MORE_INFORMATION_REQUIRED';
  const complete = Boolean(application?.vehicle && application.licence_placeholder && application.vehicle_documents_ready);
  const sections: Record<Step, ReactNode> | null = application ? {
    Profile: <>{cityFeedback}<ProfileFields cities={cities ?? []} application={application} /></>,
    Vehicle: <VehicleFields application={application} />,
    Documents: <DocumentFields application={application} />,
    Review: <><ApplicationSummary application={application} /><p className="v5-muted">{complete ? 'Submission sends these synthetic details to the operations review queue.' : 'Save your vehicle and demo documents before submitting.'}</p></>,
  } : null;

  return (
    <main className="page v5-page v5-member">
      <header className="v5-member-header">
        <div><span className="pilot-label">Driver workspace</span><h1>{application?.status === 'APPROVED' ? 'Driver dashboard' : 'Your application'}</h1></div>
        <button className="button secondary" type="button" onClick={logout} disabled={busy}>Sign out</button>
      </header>
      {messages}
      {!application && (
        <section className="v5-card">
          {loadingProfile ? <p role="status">Loading your application&hellip;</p> :
            <button className="button secondary" type="button" onClick={() => { setError(''); setProfileRetry(value => value + 1); }}>Reload application</button>}
        </section>
      )}
      {application && (
        <div className="v5-workspace">
          <aside className="v5-card v5-progress" aria-label="Application overview">
            <span className="v5-status" data-status={application.status}>{statusLabels[application.status]}</span>
            <h2>{application.full_name}</h2>
            <p className="v5-muted">{application.city}, {application.state} &middot; Demo account</p>
            {editable && <ol>{steps.map((name, index) => (
              <li key={name}><button type="button" aria-current={step === name ? 'step' : undefined}
                disabled={busy || (name === 'Documents' && !application.vehicle)}
                onClick={() => { setStep(name); setError(''); setNotice(''); }}>
                <span>{index + 1}</span>{name}
              </button></li>
            ))}</ol>}
            {!editable && <button className="button secondary" type="button" disabled={loadingProfile || busy} onClick={() => {
              setError(''); setNotice(''); setProfileRetry(value => value + 1);
            }}>{loadingProfile ? 'Refreshing…' : 'Refresh status'}</button>}
          </aside>
          <motion.section key={editable ? step : application.status} className="v5-card v5-stage"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2>{editable ? ({ Profile: 'Personal information', Vehicle: 'Register your vehicle', Documents: 'Demo document checklist', Review: 'Review and submit' })[step] : statusLabels[application.status]}</h2>
            <p className="v5-muted">{statusCopy[application.status]}</p>
            {application.review_feedback && <p className="notice"><strong>Reviewer feedback</strong><br />{application.review_feedback}</p>}
            {editable && sections ? (
              <form onSubmit={save}>
                <fieldset className="v5-form" disabled={busy}>
                  {sections[step]}
                  <button type="submit" className="button v5-submit" disabled={(step === 'Profile' && !cities?.length) || (step === 'Review' && !complete)}>
                    {busy ? 'Saving…' : step === 'Review' ? 'Submit for demo review' : 'Save and continue'}
                  </button>
                </fieldset>
              </form>
            ) : (
              <>
                <ApplicationSummary application={application} />
                {application.status === 'APPROVED' && (
                  <ApprovedDriverConsole session={session} application={application} />
                )}
              </>
            )}
          </motion.section>
        </div>
      )}
    </main>
  );
}


function ApprovedDriverConsole({ session, application }: { session: DriverSession; application: Application }) {
  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [selectedLoc, setSelectedLoc] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showKeypad, setShowKeypad] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [keypadError, setKeypadError] = useState('');
  const [payoutCelebration, setPayoutCelebration] = useState<{ amount: string; fee: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await getDriverStatus(session.token);
      setStatus(res);
      if (!selectedLoc && res.locations?.length > 0) {
        setSelectedLoc(res.locations[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 2500);
    return () => clearInterval(timer);
  }, [session.token]);

  const toggleOnline = async () => {
    setBusy(true);
    setError('');
    try {
      const targetState = !status?.online;
      const res = await setDriverAvailability(targetState, targetState ? selectedLoc : null, session.token);
      setStatus(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (action: 'accept' | 'decline' | 'advance', expectedStatus: string, pin?: string) => {
    if (!status?.ride) return;
    setBusy(true);
    setError('');
    setKeypadError('');
    try {
      const ride = status.ride;
      const res = await driverAction(ride.id, action, expectedStatus, session.token, pin);
      setStatus(res);
      if (expectedStatus === 'IN_PROGRESS' && action === 'advance') {
        setShowKeypad(false);
        setPinInput('');
        setPayoutCelebration({
          amount: ride.driver_gross_ngn || ride.fare_ngn,
          fee: ride.platform_fee_ngn || '280',
        });
        setTimeout(() => setPayoutCelebration(null), 8000);
      }
    } catch (e) {
      if (showKeypad) {
        setKeypadError((e as Error).message);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleKeyClick = (num: string) => {
    if (pinInput.length < 6) {
      setPinInput(prev => prev + num);
      setKeypadError('');
    }
  };

  const handleBackspace = () => {
    setPinInput(prev => prev.slice(0, -1));
    setKeypadError('');
  };

  const currentRide = status?.ride;
  const walletNum = status?.wallet_balance_ngn ? Number(status.wallet_balance_ngn).toLocaleString() : '0';

  return (
    <div className="approved-driver-console" style={{ marginTop: '24px' }}>
      {/* Driver Wallet & Balance Banner */}
      <motion.div
        className="driver-wallet-card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.8 }}>
            Driver Instant Wallet Balance
          </span>
          <div className="wallet-balance-num">₦{walletNum}</div>
          <div className="wallet-sub">
            <span>🛡️ Escrow Settled</span>
            <span>•</span>
            <span>Routena 8% Fair Fee (You keep 92%)</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="pill success" style={{ background: 'rgba(78, 243, 190, 0.2)', color: '#4ef3be' }}>
            {status?.completed_trips_count || 0} Trips Completed
          </span>
        </div>
      </motion.div>

      {/* Instant Payout Celebration Notification */}
      <AnimatePresence>
        {payoutCelebration && (
          <motion.div
            className="instant-payout-celebration"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{ marginBottom: '20px' }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉 ₦{Number(payoutCelebration.amount).toLocaleString()}</div>
            <h3>Instant Escrow Payout Released!</h3>
            <p style={{ margin: '6px 0', opacity: 0.9 }}>
              The 6-digit handover PIN was verified upon safe arrival at destination.
            </p>
            <small style={{ opacity: 0.8 }}>
              Routena 8% service fee deducted. Funds are immediately available in your wallet.
            </small>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Online / Offline Controls */}
      <div className="v5-card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: status?.online ? '#1ca269' : '#8898aa',
                  display: 'inline-block',
                }}
              />
              <strong>{status?.online ? 'You are Online — Ready for Rides' : 'You are Offline'}</strong>
            </div>
            <p className="v5-muted" style={{ margin: '4px 0 0 20px', fontSize: '13px' }}>
              {status?.online
                ? 'Your location is broadcasting in Calabar. Incoming requests will appear below.'
                : 'Choose a hub to go online and receive rides with fuel-indexed fares.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {!status?.online && status?.locations && status.locations.length > 0 && (
              <select
                value={selectedLoc}
                onChange={e => setSelectedLoc(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--line)' }}
              >
                {status.locations.map(loc => (
                  <option key={loc} value={loc}>
                    📍 {loc}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              className={`button ${status?.online ? 'secondary' : ''}`}
              onClick={toggleOnline}
              disabled={busy}
            >
              {busy ? 'Updating…' : status?.online ? 'Go Offline' : 'Go Online ↗'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="notice error" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* Active Ride Offer */}
      {currentRide?.status === 'OFFERED' && (
        <motion.div
          className="v5-card"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            border: '2px solid #0c8b66',
            background: 'linear-gradient(180deg, #ffffff 0%, #f4fbf8 100%)',
            boxShadow: '0 16px 36px rgba(12, 107, 79, 0.15)',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="pill live">🔔 Incoming Ride Offer</span>
            <span className="fuel-live-pill">
              <span className="fuel-icon">⛽</span> Fuel-Indexed
            </span>
          </div>

          <h3 style={{ margin: '14px 0 6px' }}>New Trip: Standard Vehicle</h3>
          <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)' }}>
            Distance: {(currentRide.route.distance_meters / 1000).toFixed(2)} km · Approx. {Math.ceil(currentRide.route.duration_seconds / 60)} min
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '12px',
              padding: '14px',
              background: '#eef8f3',
              borderRadius: '12px',
              margin: '14px 0',
            }}
          >
            <div>
              <small style={{ color: 'var(--ink-soft)', display: 'block' }}>Total Fare</small>
              <strong style={{ fontSize: '18px', color: 'var(--ink)' }}>₦{Number(currentRide.fare_ngn).toLocaleString()}</strong>
            </div>
            <div>
              <small style={{ color: 'var(--ink-soft)', display: 'block' }}>Your Payout (92%)</small>
              <strong style={{ fontSize: '18px', color: 'var(--primary)' }}>₦{Number(currentRide.driver_gross_ngn || currentRide.fare_ngn).toLocaleString()}</strong>
            </div>
            <div>
              <small style={{ color: 'var(--ink-soft)', display: 'block' }}>Guaranteed Margin</small>
              <strong style={{ fontSize: '18px', color: '#1ca269' }}>+₦{Number(currentRide.driver_margin_ngn || '400').toLocaleString()}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              type="button"
              className="button"
              style={{ flex: 1 }}
              onClick={() => handleAction('accept', 'OFFERED')}
              disabled={busy}
            >
              Accept Ride ↗
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => handleAction('decline', 'OFFERED')}
              disabled={busy}
            >
              Decline
            </button>
          </div>
        </motion.div>
      )}

      {/* Active Trip Progression */}
      {currentRide && ['ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(currentRide.status) && (
        <motion.div
          className="v5-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: '20px', borderLeft: '4px solid var(--primary)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="pill">Active Trip &middot; {currentRide.status}</span>
            <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '18px' }}>
              ₦{Number(currentRide.driver_gross_ngn || currentRide.fare_ngn).toLocaleString()} Payout
            </span>
          </div>

          <div style={{ margin: '16px 0' }}>
            <p style={{ margin: '4px 0' }}>
              <strong>Passenger Destination:</strong> Destination Zone ({(currentRide.route.distance_meters / 1000).toFixed(2)} km)
            </p>
            <p className="v5-muted" style={{ fontSize: '13px' }}>
              🔒 Payment is locked in Escrow. You will receive your instant payout as soon as the passenger gives you their 6-digit completion code.
            </p>
          </div>

          <div style={{ marginTop: '16px' }}>
            {currentRide.status === 'ACCEPTED' && (
              <button
                type="button"
                className="button"
                onClick={() => handleAction('advance', 'ACCEPTED')}
                disabled={busy}
              >
                Driving to Pickup &rarr;
              </button>
            )}

            {currentRide.status === 'DRIVER_ARRIVING' && (
              <button
                type="button"
                className="button"
                onClick={() => handleAction('advance', 'DRIVER_ARRIVING')}
                disabled={busy}
              >
                I Have Arrived at Pickup &rarr;
              </button>
            )}

            {currentRide.status === 'DRIVER_ARRIVED' && (
              <button
                type="button"
                className="button"
                onClick={() => handleAction('advance', 'DRIVER_ARRIVED')}
                disabled={busy}
              >
                Passenger Picked Up &middot; Start Trip &rarr;
              </button>
            )}

            {currentRide.status === 'IN_PROGRESS' && (
              <button
                type="button"
                className="button"
                style={{ background: 'linear-gradient(180deg, #13d59d, #0c8b66)', width: '100%' }}
                onClick={() => {
                  setPinInput('');
                  setKeypadError('');
                  setShowKeypad(true);
                }}
                disabled={busy}
              >
                🏁 Arrived at Destination &middot; Enter 6-Digit Handover PIN
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* 6-Digit PIN Keypad Modal */}
      {showKeypad && (
        <div className="driver-keypad-modal">
          <motion.div
            className="driver-keypad-body"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <h3 style={{ margin: '0 0 6px' }}>Trip Completion & Handover</h3>
            <p className="v5-muted" style={{ fontSize: '14px', margin: '0 0 16px' }}>
              Ask the passenger for the 6-digit code on their Routena app to verify drop-off and unlock your escrow payout.
            </p>

            <div className="keypad-pin-preview">
              {[0, 1, 2, 3, 4, 5].map(idx => (
                <div
                  key={idx}
                  className={`keypad-pin-digit ${pinInput.length > idx ? 'filled' : ''}`}
                >
                  {pinInput[idx] || '•'}
                </div>
              ))}
            </div>

            {keypadError && (
              <div className="notice error" style={{ marginBottom: '12px', fontSize: '13px' }}>
                {keypadError}
              </div>
            )}

            <div className="keypad-grid">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                <button
                  type="button"
                  key={digit}
                  className="keypad-key"
                  onClick={() => handleKeyClick(digit)}
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                className="keypad-key"
                onClick={() => setPinInput('')}
                style={{ fontSize: '15px' }}
              >
                Clear
              </button>
              <button
                type="button"
                className="keypad-key"
                onClick={() => handleKeyClick('0')}
              >
                0
              </button>
              <button
                type="button"
                className="keypad-key"
                onClick={handleBackspace}
                style={{ fontSize: '16px' }}
              >
                ⌫
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowKeypad(false)}
                disabled={busy}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                disabled={pinInput.length !== 6 || busy}
                onClick={() => handleAction('advance', 'IN_PROGRESS', pinInput)}
                style={{ flex: 2 }}
              >
                {busy ? 'Verifying PIN…' : 'Verify & Release Payout ↗'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
