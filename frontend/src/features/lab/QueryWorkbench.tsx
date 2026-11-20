import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Braces, Play, Terminal } from 'lucide-react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';

interface CatalogItem {
  key: string;
  title: string;
  concept: string;
  flow: string;
  needs_sample: boolean;
}
interface QueryOutput {
  statement: string;
  parameters: Record<string, unknown>;
  columns: string[];
  rows: Record<string, unknown>[];
  plan: string[];
  truncated: boolean;
}

export function QueryWorkbench() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [activeKey, setActiveKey] = useState('inventory');
  const [sampleCode, setSampleCode] = useState('S003');
  const [output, setOutput] = useState<QueryOutput | null>(null);
  const [mode, setMode] = useState<'rows' | 'plan' | 'sql'>('rows');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController>();

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<CatalogItem[]>('/lab/queries', { signal: controller.signal }).then(setCatalog)
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  async function execute(event: FormEvent) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setOutput(null);
    try {
      const params = new URLSearchParams({ sample_code: sampleCode });
      setOutput(await apiRequest<QueryOutput>(`/lab/sql/${activeKey}?${params}`, { signal: controller.signal }));
      setMode('rows');
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const active = catalog.find(query => query.key === activeKey);
  return (
    <section className="lab-grid">
      <div className="card lab-panel">
        <div className="lab-title"><Terminal size={20} /><h2>SQL workbench</h2>
          <ConceptInfo title="Read-only SQL execution" steps={['Choose a query', 'Bind input', 'Run SQL', 'Inspect rows and plan']}>
            <p>Each preset executes against the same relational database as the workspace. Inputs are bound as data, so the user cannot append or modify SQL. The plan comes from the database engine.</p>
          </ConceptInfo>
        </div>
        <div className="query-list" aria-label="SQL query presets">
          {catalog.map(query => (
            <button className="query-preset" key={query.key} type="button" disabled={busy}
              aria-pressed={query.key === activeKey} onClick={() => { setActiveKey(query.key); setOutput(null); }}>
              <strong>{query.title}</strong><small>{query.concept}</small>
            </button>
          ))}
        </div>
        <form className="lab-controls" onSubmit={execute}>
          {active?.needs_sample && <label>Reference specimen code
            <input className="input-field" value={sampleCode} maxLength={40} required
              disabled={busy} onChange={event => { setSampleCode(event.target.value); setOutput(null); }} />
          </label>}
          <button className="btn-primary" type="submit" disabled={!active || busy}>
            <Play size={16} />{busy ? 'Executing…' : 'Run query'}
          </button>
        </form>
        {error && <p className="lab-error" role="alert">{error}</p>}
      </div>
      <div className="card lab-panel">
        <div className="lab-title"><Braces size={20} /><h2>Result inspector</h2>
          {active && <ConceptInfo title={active.concept} steps={active.flow.split(' → ')}>
            <p>{active.title} uses the relations shown above. Open SQL to see the statement and bound values, or Query plan to see how the active engine reads the tables.</p>
            {active.key === 'division' && <p>A candidate qualifies only when a completed passing result exists for every assay type recorded for the reference sample. An empty requirement set returns zero candidates for this lab exercise.</p>}
          </ConceptInfo>}
        </div>
        {!output ? <p className="lab-muted">{busy ? 'Running the selected SQL statement…' : 'Choose a preset and run it to inspect live data.'}</p> : (
          <>
            <div className="lab-tabs" aria-label="Query output">
              {(['rows', 'sql', 'plan'] as const).map(view => (
                <button key={view} type="button" aria-pressed={mode === view} onClick={() => setMode(view)}>
                  {{ rows: `Rows (${output.rows.length}${output.truncated ? '+' : ''})`, sql: 'SQL', plan: 'Query plan' }[view]}
                </button>
              ))}
            </div>
            {mode === 'rows' ? (
              <div className="lab-table-wrap">
                <table className="lab-table">
                  <thead><tr>{output.columns.map(column => <th scope="col" key={column}>{column.replace(/_/g, ' ')}</th>)}</tr></thead>
                  <tbody>{output.rows.map((row, index) => (
                    <tr key={index}>{output.columns.map(column => <td key={column}>{String(row[column] ?? '—')}</td>)}</tr>
                  ))}</tbody>
                </table>
                {output.rows.length === 0 && <p className="lab-muted">The query returned zero rows.</p>}
              </div>
            ) : <pre className="lab-code">{mode === 'sql'
              ? `${output.statement}\n\n${JSON.stringify(output.parameters, null, 2)}`
              : output.plan.join('\n')}</pre>}
          </>
        )}
      </div>
    </section>
  );
}

