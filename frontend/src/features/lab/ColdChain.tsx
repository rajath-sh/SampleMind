import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Database, GitFork, Thermometer } from 'lucide-react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';
import { useAuth } from '../auth/AuthContext';
import { storageService } from '../storage/storageService';
import type { StorageLocation } from '../storage/types';

type ReadingState = 'within' | 'above' | 'below' | 'unconfigured';
interface Reading {
  reading_id: string;
  location_code: string;
  recorded_at: string;
  temperature_c: number;
  instrument: string;
  note: string;
  limits: { min: number | null; max: number | null };
  state: ReadingState;
  specimens: { id: number; code: string }[];
}
interface ReadingResults {
  documents: Reading[];
  match_count: number;
  excursion_count: number;
  statement: string;
  parameters: Record<string, unknown>;
}
const labels: Record<ReadingState, string> = {
  within: 'Within limits', above: 'Above limit', below: 'Below limit', unconfigured: 'Limits incomplete',
};

export function ColdChain({ onOpenLineage }: { onOpenLineage: (id: number) => void }) {
  const { user } = useAuth();
  const canRecord = ['ADMIN', 'RESEARCHER', 'TECHNICIAN'].includes(user?.role || '');
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [filter, setFilter] = useState('');
  const [excursions, setExcursions] = useState(false);
  const [result, setResult] = useState<ReadingResults>();
  const [selectedId, setSelectedId] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [queryOpen, setQueryOpen] = useState(false);
  const [error, setError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [locationError, setLocationError] = useState('');
  const [form, setForm] = useState({ location: '', temperature: '', instrument: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const pending = useRef<{ payload: string; id: string }>();

  useEffect(() => {
    let active = true;
    storageService.listLocations().then(data => {
      if (!active) return;
      setLocations(data);
      const first = data.find(loc => loc.is_active);
      if (first) setForm(previous => ({ ...previous, location: String(first.storage_location_id) }));
    }).catch(err => { if (active) setLocationError(err.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setLoading(true);
    const params = new URLSearchParams({ excursions: String(excursions) });
    if (filter) params.set('location_id', filter);
    apiRequest<ReadingResults>(`/lab/readings?${params}`, { signal: controller.signal }).then(data => {
      setResult(data);
      setSelectedId(previous => data.documents.some(doc => doc.reading_id === previous) ? previous : data.documents[0]?.reading_id);
    }).catch(err => {
      if (!controller.signal.aborted) { setResult(undefined); setError(err.message); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, excursions, refresh]);

  async function record(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const data = {
      location_id: Number(form.location),
      temperature_c: Number(form.temperature),
      instrument: form.instrument.trim(),
      note: form.note.trim(),
    };
    const payload = JSON.stringify(data);
    if (pending.current?.payload !== payload) pending.current = { payload, id: crypto.randomUUID() };
    setSaving(true);
    setFormMessage('');
    try {
      const reading = await apiRequest<Reading>('/lab/readings', {
        method: 'POST', body: JSON.stringify({ ...data, reading_id: pending.current.id }),
      });
      pending.current = undefined;
      setFormMessage(`Reading saved · ${labels[reading.state]}`);
      setForm(previous => ({ ...previous, temperature: '', note: '' }));
      setFilter(String(data.location_id));
      setExcursions(false);
      setSelectedId(reading.reading_id);
      setRefresh(version => version + 1);
    } catch (err) {
      setFormMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const selected = result?.documents.find(doc => doc.reading_id === selectedId);
  const available = locations.filter(loc => loc.is_active);
  function fillDemoReading() {
    const location = available.find(item => String(item.storage_location_id) === form.location) ?? available[0];
    if (!location) return;
    const threshold = location.temperature_max_c;
    setForm({
      location: String(location.storage_location_id),
      temperature: threshold == null ? '20' : String(Math.min(150, threshold + 5)),
      instrument: 'Classroom simulation',
      note: 'Simulated reading for the DBMS demonstration.',
    });
    setFormMessage('Example filled in. Choose Record reading to store it.');
  }

  return (
    <section className="card lab-panel">
      <div className="lab-title"><Thermometer size={20} /><h2>Cold-chain evidence</h2>
        <ConceptInfo title="Temperature excursion screening" steps={['Capture reading', 'Look up SQL limits', 'Classify excursion', 'Inspect specimen snapshot']}
         >
          <p>Each temperature document stores the recorded reading, configured range and specimens assigned at the time of capture.</p>
          <p>A red cell means that reading crossed a configured limit. Temperature readings screen for follow-up and cannot determine specimen viability or reconstruct what happened between readings.</p>
        </ConceptInfo>
      </div>
      <div className="lab-controls lab-filter">
        <label>Storage location<select className="input-field" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="">All locations</option>
          {locations.map(location => <option value={location.storage_location_id} key={location.storage_location_id}>{location.location_code}</option>)}
        </select></label>
        <label className="lab-check"><input type="checkbox" checked={excursions} onChange={event => setExcursions(event.target.checked)} /> Excursions only</label>
        <button type="button" className="btn-secondary" aria-expanded={queryOpen} onClick={() => setQueryOpen(!queryOpen)}>
          <Database size={15} /> NoSQL query
        </button>
      </div>
      {(error || locationError) && <p role="alert" className="lab-error">{error || locationError}</p>}
      <p className="lab-muted" aria-live="polite">{loading ? 'Reading temperature documents…' : result
        ? `${result.match_count} readings · ${result.excursion_count} excursions in this filter` : 'Readings are unavailable.'}</p>
      {queryOpen && result && !loading && <pre className="lab-code">{result.statement}{'\n'}{JSON.stringify(result.parameters, null, 2)}</pre>}
      {result && !loading && <>
        <div className="cryo-mosaic" aria-label="Recent temperature readings">
          {result.documents.map(item => (
            <button key={item.reading_id} type="button" className={`cryo-cell cryo-${item.state}`}
              aria-pressed={item.reading_id === selectedId} onClick={() => setSelectedId(item.reading_id)}>
              <small>{item.location_code}</small>
              <strong>{item.temperature_c} °C</strong>
              <span>{labels[item.state]}</span>
            </button>
          ))}
        </div>
        {!selected && <p className="lab-muted">There are no readings in this view. Enter a reading below to see how the location’s limits classify it.</p>}
        {selected && <div className="cryo-detail">
          <h3>{selected.location_code} · {selected.temperature_c} °C</h3>
          <p>{labels[selected.state]} · Configured range {selected.limits.min ?? '—'} to {selected.limits.max ?? '—'} °C</p>
          <p className="lab-muted">{selected.instrument} · {new Date(selected.recorded_at).toLocaleString()}</p>
          {selected.note && <p>{selected.note}</p>}
          <div className="lab-chips">
            {selected.specimens.map(specimen => (
              <button type="button" key={specimen.id} className="btn-secondary" onClick={() => onOpenLineage(specimen.id)}>
                <GitFork size={15} />{specimen.code}
              </button>
            ))}
            {selected.specimens.length === 0 && <span className="lab-muted">No active specimens assigned at capture.</span>}
          </div>
        </div>}
      </>}
      {canRecord && <form className="reading-form" onSubmit={record}>
        <h3>Record a temperature reading</h3>
        <fieldset className="lab-controls" disabled={saving}>
          <label>Active location<select className="input-field" required value={form.location} onChange={event => setForm({ ...form, location: event.target.value })}>
            <option value="">Select a location</option>
            {available.map(location => <option value={location.storage_location_id} key={location.storage_location_id}>{location.location_code}</option>)}
          </select></label>
          <label>Temperature (°C)<input className="input-field" type="number" min={-273.15} max={150} step="0.01" required
            value={form.temperature} onChange={event => setForm({ ...form, temperature: event.target.value })} /></label>
          <label>Instrument or source<input className="input-field" minLength={2} maxLength={80} required
            placeholder="e.g. Demo probe" value={form.instrument} onChange={event => setForm({ ...form, instrument: event.target.value })} /></label>
          <label>Note<input className="input-field" maxLength={500} value={form.note}
            onChange={event => setForm({ ...form, note: event.target.value })} /></label>
          <button className="btn-secondary" type="button" disabled={available.length === 0} onClick={fillDemoReading}>Fill demo reading</button>
          <button className="btn-primary" type="submit" disabled={saving || available.length === 0}>{saving ? 'Recording…' : 'Record reading'}</button>
        </fieldset>
        {formMessage && <p role="status" className="lab-muted">{formMessage}</p>}
      </form>}
    </section>
  );
}

