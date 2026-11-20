import { useEffect, useState } from 'react';
import { Database, GitFork, RefreshCw, ScanLine } from 'lucide-react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';
import { samplesService } from '../samples/samplesService';

interface EventDocument {
  audit_id: number;
  occurred_at: string;
  action: string;
  subject: { type: string; id: number | null };
  sample_ids: number[];
  evidence: Record<string, unknown>;
}

interface Results {
  documents: EventDocument[];
  match_count: number;
  projected: number;
  actions: string[];
  statement: string;
  parameters: Record<string, unknown>;
}

const subjects = ['Sample', 'SampleRelationship', 'SampleTest', 'Incident', 'AIAnalysis'];

export function CustodyLens({ onOpenLineage }: { onOpenLineage: (id: number) => void }) {
  const [specimens, setSpecimens] = useState<{ id: number; code: string }[]>([]);
  const [sample, setSample] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Results>();
  const [selection, setSelection] = useState<number>();
  const [showQuery, setShowQuery] = useState(false);
  const [error, setError] = useState('');
  const [specimenError, setSpecimenError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    samplesService.listSamples({ pageSize: 100 })
      .then(data => { if (active) setSpecimens(data.items.map(s => ({ id: s.sample_id, code: s.sample_code }))); })
      .catch(err => { if (active) setSpecimenError(err.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (sample.trim()) params.set('sample_code', sample.trim());
    if (entity) params.set('entity', entity);
    if (action) params.set('action', action);
    const timer = window.setTimeout(() => apiRequest<Results>(`/lab/custody?${params}`, { signal: controller.signal }).then(data => {
      setResult(data);
      setSelection(previous => data.documents.some(doc => doc.audit_id === previous) ? previous : data.documents[0]?.audit_id);
    }).catch(err => {
      if (!controller.signal.aborted) { setResult(undefined); setError(err.message); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); }), 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [sample, entity, action, version]);

  const selected = result?.documents.find(doc => doc.audit_id === selection);
  return (
    <section className="card lab-panel">
      <div className="lab-title"><ScanLine size={20} /><h2>Custody lens</h2>
        <ConceptInfo title="Document aggregates and traceability" steps={['SQL transaction', 'Committed audit row', 'Replay by audit ID', 'Search nested document']}
         >
          <p>The document view collects committed registrations, transformations, tests and incidents in a searchable projection.</p>
          <p>TinyDB holds one aggregate per audited action. SQL remains authoritative. Reading this lens replays committed events by their unique audit IDs. Repeating the replay leaves existing document counts unchanged.</p>
        </ConceptInfo>
      </div>
      <div className="lab-controls lab-filter">
        <label>Specimen code<input className="input-field" list="custody-specimens" value={sample} maxLength={40}
          placeholder="All specimens" onChange={e => setSample(e.target.value)} />
          <datalist id="custody-specimens">{specimens.map(item => <option key={item.id} value={item.code} />)}</datalist>
        </label>
        <label>Document subject<select className="input-field" value={entity} onChange={e => setEntity(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map(subject => <option key={subject}>{subject}</option>)}
        </select></label>
        <label>Event action<select className="input-field" value={action} onChange={e => setAction(e.target.value)}>
          <option value="">All actions</option>
          {result?.actions.map(item => <option key={item}>{item}</option>)}
        </select></label>
        <button className="btn-secondary" type="button" disabled={loading} onClick={() => setVersion(v => v + 1)}><RefreshCw size={15} /> Replay</button>
      </div>
      {(error || specimenError) && <p className="lab-error" role="alert">{error || specimenError}</p>}
      <p className="lab-muted" aria-live="polite">{loading ? 'Reading committed events…' :
        result ? `${result.match_count} matching documents · ${result.projected} newly projected` : 'Custody documents are unavailable.'}</p>
      {result && !loading && <>
        <button className="btn-secondary" type="button" aria-expanded={showQuery} onClick={() => setShowQuery(!showQuery)}>
          <Database size={15} />{showQuery ? 'Hide NoSQL query' : 'Inspect NoSQL query'}
        </button>
        {showQuery && <pre className="lab-code">{result.statement}{'\n'}{JSON.stringify(result.parameters, null, 2)}</pre>}
        <div className="lab-grid lab-inner-grid">
          <div className="trace-rail">
            {result.documents.map(event => (
              <button className="trace-node" key={event.audit_id} type="button" aria-pressed={event.audit_id === selection}
                onClick={() => setSelection(event.audit_id)}>
                <strong>{event.action.toLowerCase().replace(/_/g, ' ')}</strong>
                <span>{event.subject.type} · {new Date(event.occurred_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
          {selected && <div>
            <pre className="lab-code">{JSON.stringify(selected, null, 2)}</pre>
            <div className="lab-chips">
              {selected.sample_ids.map(id => (
                <button type="button" className="btn-secondary" key={id} onClick={() => onOpenLineage(id)}>
                  <GitFork size={15} /> Lineage · {specimens.find(s => s.id === id)?.code || id}
                </button>
              ))}
            </div>
          </div>}
        </div>
        {result.documents.length === 0 && <p className="lab-muted">No audited actions match these filters. Register, move, derive or test a specimen to add a live event.</p>}
      </>}
    </section>
  );
}

