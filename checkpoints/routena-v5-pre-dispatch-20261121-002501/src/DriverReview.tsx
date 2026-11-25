import { useEffect, useRef, useState, type FormEvent } from 'react';
import { driverApi, DriverApiError, driverError, field, statuses, statusLabels, type AdminApplication, type Decision, type DriverStatus, type DriverSummary } from './driverApi';
import { ApplicationSummary, InputField } from './DriverForms';

const decisions: Partial<Record<DriverStatus, Decision[]>> = {
  PENDING_REVIEW: ['MORE_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED'],
  APPROVED: ['SUSPENDED'],
};

export function DriverReview() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<DriverStatus>('PENDING_REVIEW');
  const [queue, setQueue] = useState<DriverSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<AdminApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const action = useRef<AbortController | null>(null);

  useEffect(() => () => action.current?.abort(), []);

  function lock() {
    setToken('');
    setQueue([]);
    setDetail(null);
    setOffset(0);
    setStatus('PENDING_REVIEW');
  }

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
      if (reason instanceof DriverApiError && (reason.status === 401 || reason.status === 403)) lock();
      setError(driverError(reason));
    } finally {
      if (action.current === controller) { action.current = null; setBusy(false); }
    }
  }

  function authorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const credential = field(new FormData(form), 'review_token').trim();
    form.reset();
    void run(async signal => {
      const result = await driverApi.queue(credential, 'PENDING_REVIEW', 0, signal);
      if (signal.aborted) return;
      setToken(credential);
      setQueue(result);
    });
  }

  function loadQueue(nextStatus: DriverStatus, nextOffset = 0) {
    void run(async signal => {
      const result = await driverApi.queue(token, nextStatus, nextOffset, signal);
      if (signal.aborted) return;
      setStatus(nextStatus);
      setOffset(nextOffset);
      setQueue(result);
      setDetail(null);
    });
  }

  function inspect(id: number) {
    setDetail(null);
    void run(async signal => {
      const result = await driverApi.inspect(token, id, signal);
      if (!signal.aborted) setDetail(result);
    });
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const data = new FormData(event.currentTarget);
    const id = detail.id;
    const next = field(data, 'decision') as Decision;
    if (!decisions[detail.status]?.includes(next)) return;
    void run(async signal => {
      const result = await driverApi.review(token, id, { status: next, feedback: field(data, 'feedback').trim() }, signal);
      if (signal.aborted) return;
      setNotice('Review saved. Application status: ' + statusLabels[result.status] + '.');
      setDetail(null);
      setQueue(previous => previous.filter(item => item.id !== id));
      const [updated, refreshed] = await Promise.all([
        driverApi.inspect(token, id, signal),
        driverApi.queue(token, status, offset, signal),
      ]);
      if (signal.aborted) return;
      setQueue(refreshed);
      setDetail(updated);
    });
  }

  const available = detail ? decisions[detail.status] ?? [] : [];
  return (
    <main className="dashboard-main v5-ops">
      <div className="v5-member-header">
        <div><span className="pilot-label">Routena operations</span><h1>Driver review</h1></div>
        {token && <button className="button secondary" type="button" disabled={busy} onClick={() => { lock(); setError(''); setNotice(''); }}>Lock review</button>}
      </div>
      <p className="v5-muted">Review synthetic applications and record decisions in the demo audit history.</p>
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="v5-success" role="status">{notice}</p>}
      {!token ? (
        <section className="v5-card v5-review-access" aria-labelledby="review-access">
          <h2 id="review-access">Reviewer authorization</h2>
          <p className="v5-muted">Enter the separate driver review credential to open the protected queue.</p>
          <form onSubmit={authorize}>
            <fieldset className="v5-form" disabled={busy}>
              <InputField label="Driver review token"><input name="review_token" type="password" autoComplete="off" required spellCheck={false} /></InputField>
              <button className="button v5-submit" type="submit">{busy ? 'Checking access…' : 'Open review queue'}</button>
            </fieldset>
          </form>
        </section>
      ) : (
        <div className="v5-review-layout" aria-busy={busy}>
          <section className="v5-card v5-review-queue" aria-labelledby="queue-title">
            <h2 id="queue-title">Applications</h2>
            <InputField label="Filter by status"><select value={status} disabled={busy} onChange={event => loadQueue(event.target.value as DriverStatus)}>
              {statuses.map(value => <option value={value} key={value}>{statusLabels[value]}</option>)}
            </select></InputField>
            <button className="v5-text-button" type="button" disabled={busy} onClick={() => loadQueue(status, offset)}>Refresh queue</button>
            {!queue.length && <p className="v5-muted">No applications on this page.</p>}
            <ul className="v5-review-list">
              {queue.map(item => <li key={item.id}>
                <button type="button" disabled={busy} aria-pressed={detail?.id === item.id} onClick={() => inspect(item.id)}>
                  <strong>{item.full_name}</strong><small>Application #{item.id} &middot; {statusLabels[item.status]}</small>
                </button>
              </li>)}
            </ul>
            <div className="v5-pagination">
              <button type="button" className="v5-text-button" disabled={busy || offset === 0} onClick={() => loadQueue(status, offset - 50)}>Previous</button>
              <button type="button" className="v5-text-button" disabled={busy || queue.length < 50} onClick={() => loadQueue(status, offset + 50)}>Next</button>
            </div>
          </section>
          <section className="v5-card v5-review-detail" aria-label="Application detail">
            {busy && <p className="v5-muted" role="status">Working&hellip;</p>}
            {!detail && !busy && <p className="v5-muted">Select an application to see its details and review history.</p>}
            {detail && <>
              <span className="v5-status" data-status={detail.status}>{statusLabels[detail.status]}</span>
              <h2>Application #{detail.id}</h2>
              <ApplicationSummary application={detail} />
              <dl className="v5-facts">
                <div><dt>Demo contact</dt><dd>{detail.email}<br />{detail.phone}</dd></div>
                <div><dt>Licence placeholder</dt><dd>{detail.licence_placeholder || 'Missing'}</dd></div>
                {detail.vehicle && <>
                  <div><dt>Vehicle details</dt><dd>{detail.vehicle.year} &middot; {detail.vehicle.colour} &middot; {detail.vehicle.fuel_type}</dd></div>
                  <div><dt>Demo registration</dt><dd>{detail.vehicle.registration_number}</dd></div>
                  <div><dt>Claimed efficiency</dt><dd>{detail.vehicle.claimed_fuel_efficiency ? detail.vehicle.claimed_fuel_efficiency + ' km/L (unverified)' : 'Unspecified'}</dd></div>
                </>}
              </dl>
              {detail.review_feedback && <p className="notice"><strong>Latest feedback</strong><br />{detail.review_feedback}</p>}
              {available.length > 0 && <form key={detail.id + ':' + detail.status} onSubmit={review}>
                <fieldset className="v5-form" disabled={busy}>
                  <InputField label="Review decision"><select name="decision" defaultValue="" required>
                    <option value="">Select a decision</option>
                    {available.map(decision => <option value={decision} key={decision}>{statusLabels[decision]}</option>)}
                  </select></InputField>
                  <InputField label="Reviewer feedback"><textarea name="feedback" required minLength={3} maxLength={1000} rows={3} /></InputField>
                  <button className="button v5-submit" type="submit">{busy ? 'Saving…' : 'Record decision'}</button>
                </fieldset>
              </form>}
              <h3>Review history</h3>
              {detail.history.length === 0 && <p className="v5-muted">No status changes recorded.</p>}
              <ol className="v5-history">
                {detail.history.map((event, index) => <li key={index}>
                  <strong>{statusLabels[event.from_status]} &rarr; {statusLabels[event.to_status]}</strong>
                  <small>{event.actor === 'DRIVER' ? 'Driver' : 'Demo reviewer'} &middot; <time dateTime={event.occurred_at}>
                    {new Date(event.occurred_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })} WAT
                  </time></small>
                  {event.feedback && <p>{event.feedback}</p>}
                </li>)}
              </ol>
            </>}
          </section>
        </div>
      )}
    </main>
  );
}
