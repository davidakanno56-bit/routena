import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { driverApi, driverError, DriverApiError, field, statusLabels, type Application, type City, type DriverSession } from './driverApi';
import { ApplicationSummary, DocumentFields, InputField, ProfileFields, VehicleFields, profileInput, vehicleInput } from './DriverForms';

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
                {application.status === 'APPROVED' && <div className="v5-dashboard-state"><div>
                  <strong>Driver availability</strong><p className="v5-muted">Dispatch and earnings are unavailable in the demo.</p>
                </div><button type="button" className="button secondary" disabled>Go online</button></div>}
              </>
            )}
          </motion.section>
        </div>
      )}
    </main>
  );
}
