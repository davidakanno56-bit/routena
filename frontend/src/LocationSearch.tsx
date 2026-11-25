import { useEffect, useRef, useState, type FormEvent } from 'react';
import { demoStops, validCoordinates, type Stop } from './locations';

const endpoint = import.meta.env.VITE_GEOCODER_URL?.trim();
export const sourceLabels = {
  demo: 'Demo stop', provider: 'Provider result', map: 'Map pin', device: 'Device location',
};

async function searchProvider(query: string, signal: AbortSignal): Promise<Stop[]> {
  if (!endpoint) return [];
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('q', query);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Search provider unavailable');
  const results: unknown = await response.json();
  if (!Array.isArray(results)) throw new Error('Invalid search response');
  return results.filter(item => item && typeof item.label === 'string' && item.label.trim()
    && validCoordinates(item)).slice(0, 8).map(item => ({
    label: item.label, latitude: item.latitude, longitude: item.longitude, source: 'provider',
  }));
}

export function LocationSearch({ title, onSelect, onClose }: {
  title: string; onSelect: (stop: Stop) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Stop[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const local = demoStops.filter(stop => stop.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      request.current?.abort();
      element?.close();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const term = input.trim();
    setQuery(term);
    setRemote([]);
    setStatus(endpoint && term ? 'loading' : 'idle');
    if (!endpoint || !term) return;
    try {
      const matches = await searchProvider(term, controller.signal);
      if (!controller.signal.aborted) {
        setRemote(matches);
        setStatus('idle');
      }
    } catch {
      if (!controller.signal.aborted) setStatus('error');
    }
  }

  return (
    <dialog ref={dialog} className="location-dialog" aria-labelledby="search-title" onCancel={onClose}>
      <div className="section-head">
        <h2 id="search-title">Search {title.toLowerCase()}</h2>
        <button type="button" className="stop-tool" onClick={onClose} aria-label="Close search">&#215;</button>
      </div>
      <form className="search-form" onSubmit={submit}>
        <input type="search" aria-label={'Search ' + title.toLowerCase()} autoFocus value={input}
          onChange={event => setInput(event.target.value)} placeholder={endpoint ? 'Address or place' : 'Find a Calabar demo stop'} />
        <button className="button" type="submit">Search</button>
      </form>
      <p className="search-hint">{endpoint ? 'Address search and curated Calabar demo stops.' : 'Local search covers curated Calabar demo stops.'}</p>
      <div aria-live="polite">
        {status === 'loading' && <p className="search-hint">Searching provider…</p>}
        {status === 'error' && <p className="notice">Address search is unavailable. Try a demo stop or place a pin on the map.</p>}
        {status !== 'loading' && !remote.length && !local.length && <p className="search-hint">No matches. Try another name or place a pin on the map.</p>}
      </div>
      <ul className="search-results">
        {[...remote, ...local].map((stop, index) => (
          <li key={index}>
            <button type="button" onClick={() => onSelect(stop)}>
              <strong>{stop.label}</strong><small>{sourceLabels[stop.source]}</small>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
