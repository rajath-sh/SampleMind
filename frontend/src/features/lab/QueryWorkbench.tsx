import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Braces, Play, Terminal, BookOpen, Layers, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';

interface CatalogItem {
  key: string;
  title: string;
  concept: string;
  flow: string;
  needs_sample: boolean;
  category?: string;
  elmasri_reference?: string;
  explanation?: string;
}

interface QueryOutput {
  statement: string;
  parameters: Record<string, unknown>;
  columns: string[];
  rows: Record<string, unknown>[];
  plan: string[];
  truncated: boolean;
  category?: string;
  elmasri_reference?: string;
  explanation?: string;
}

export function QueryWorkbench() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [activeKey, setActiveKey] = useState<string>('inventory');
  const [sampleCode, setSampleCode] = useState<string>('S003');
  const [output, setOutput] = useState<QueryOutput | null>(null);
  const [mode, setMode] = useState<'rows' | 'sql'>('rows');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const request = useRef<AbortController>();

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<CatalogItem[]>('/lab/queries', { signal: controller.signal })
      .then(data => {
        setCatalog(data);
        if (data.length > 0 && !data.some(d => d.key === activeKey)) {
          setActiveKey(data[0].key);
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  const categories = [...new Set(catalog.map(query => query.category || 'Other queries'))];

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
      const data = await apiRequest<QueryOutput>(`/lab/sql/${activeKey}?${params}`, { signal: controller.signal });
      setOutput(data);
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
      {/* LEFT PANEL: CATEGORIZED ELMASRI & NAVATHE SQL PRESETS */}
      <div className="card lab-panel">
        <div className="lab-title">
          <Terminal size={20} />
          <h2>SQL Workbench (Elmasri & Navathe Reference)</h2>
          <ConceptInfo
            title="Relational Queries & Elmasri Syllabus Traceability"
            steps={['Choose Relational Pattern', 'Bind Input Parameters', 'Execute SQL Engine', 'Inspect Relational Projections & Plan']}
          >
            <p>
              SampleMind examples for Basic SQL, More SQL and relational algebra in <em>Fundamentals of Database Systems</em> by Elmasri and Navathe. Advanced SQL includes additional engine-supported examples.
            </p>
            <p>
              Includes correlated subqueries, nested NOT IN, grouping with HAVING, multi-table outer joins, relational division (double NOT EXISTS), recursive CTEs, and window ranking.
            </p>
          </ConceptInfo>
        </div>

        {/* Query Presets List */}
        <div className="query-list" aria-label="SQL query presets" style={{ maxHeight: '420px', overflowY: 'auto' }}>
          {categories.map(category => <section key={category} style={{marginBottom:16}}>
          <h3 style={{margin:'8px 0'}}>{category}</h3>
          {catalog.filter(query => (query.category || 'Other queries') === category).map(query => {
            const isSelected = query.key === activeKey;
            return (
              <button
                className="query-preset"
                key={query.key}
                type="button"
                disabled={busy}
                aria-pressed={isSelected}
                onClick={() => {
                  setActiveKey(query.key);
                  setOutput(null);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid var(--color-teal)' : '1px solid #E2E8F0',
                  backgroundColor: isSelected ? 'var(--color-pale-teal)' : '#FFFFFF',
                  marginBottom: '8px',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--color-ink)' }}>{query.title}</strong>
                  {query.elmasri_reference && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#EFF6FF',
                        color: '#2563EB',
                        border: '1px solid #BFDBFE',
                      }}
                    >
                      {query.elmasri_reference.split(':')[0]}
                    </span>
                  )}
                </div>
                <small style={{ color: 'var(--color-teal)', fontWeight: 600, fontSize: '11px' }}>
                  {query.concept}
                </small>
                {query.explanation && (
                  <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--color-muted)', lineHeight: 1.35 }}>
                    {query.explanation}
                  </p>
                )}
              </button>
            );
          })}</section>)}
        </div>

        {/* Query Execution Controls */}
        <form className="lab-controls" onSubmit={execute} style={{ marginTop: '14px' }}>
          {active?.needs_sample && (
            <label>
              Reference Specimen Code (Parameter Binding)
              <input
                className="input-field"
                value={sampleCode}
                maxLength={40}
                required
                disabled={busy}
                placeholder="e.g. S003"
                onChange={event => {
                  setSampleCode(event.target.value);
                  setOutput(null);
                }}
              />
            </label>
          )}
          <button className="btn-primary" type="submit" disabled={!active || busy} style={{ width: '100%', justifyContent: 'center' }}>
            <Play size={16} />
            {busy ? 'Executing Relational Query…' : `Run: ${active?.title || 'Selected Query'}`}
          </button>
        </form>

        {error && <p className="lab-error" role="alert" style={{ marginTop: '10px' }}>{error}</p>}
      </div>

      {/* RIGHT PANEL: RESULT INSPECTOR & ACADEMIC ATTRIBUTION */}
      <div className="card lab-panel">
        <div className="lab-title">
          <Braces size={20} />
          <h2>Result Inspector & SQL Statement</h2>
        </div>

        {/* Selected Query Academic Context Banner */}
        {active && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderLeft: '4px solid var(--color-teal)',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BookOpen size={16} color="var(--color-teal)" />
                <strong style={{ fontSize: '13px', color: 'var(--color-ink)' }}>{active.title}</strong>
              </div>
              {active.elmasri_reference && (
                <span
                  className="badge"
                  style={{
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    border: '1px solid #BFDBFE',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {active.elmasri_reference}
                </span>
              )}
            </div>

            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
              <strong>Relational Concept:</strong> {active.concept}
            </div>

            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
              <strong>Database Traversal Flow:</strong> <span className="font-mono" style={{ color: 'var(--color-teal)' }}>{active.flow}</span>
            </div>

            {active.explanation && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--color-muted)', lineHeight: 1.45, borderTop: '1px solid #E2E8F0', paddingTop: '6px' }}>
                <strong>Laboratory Purpose:</strong> {active.explanation}
              </p>
            )}
          </div>
        )}

        {!output ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
            <Layers size={36} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
            <p>{busy ? 'Executing SQL query on live database engine…' : 'Choose any Elmasri & Navathe query from the left and click "Run Query" to inspect live relational records.'}</p>
          </div>
        ) : (
          <>
            {/* Output Tabs (Rows, SQL) */}
            <div className="lab-tabs" aria-label="Query output">
              {(['rows', 'sql'] as const).map(view => (
                <button key={view} type="button" aria-pressed={mode === view} onClick={() => setMode(view)}>
                  {{
                    rows: `Result Rows (${output.rows.length}${output.truncated ? '+' : ''})`,
                    sql: 'MySQL Statement & Bound Parameters',
                  }[view]}
                </button>
              ))}
            </div>

            {/* TAB 1: Live Relational Rows */}
            {mode === 'rows' && (
              <div className="lab-table-wrap">
                <div style={{ padding: '8px 12px', backgroundColor: '#F0FDF4', borderBottom: '1px solid #BBF7D0', fontSize: '12px', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} />
                  <span>
                    Query executed successfully on MySQL engine · {output.rows.length} row(s) returned
                  </span>
                </div>
                <table className="lab-table">
                  <thead>
                    <tr>
                      {output.columns.map(column => (
                        <th scope="col" key={column}>
                          {column.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {output.rows.map((row, index) => (
                      <tr key={index}>
                        {output.columns.map(column => (
                          <td key={column}>{String(row[column] ?? '—')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {output.rows.length === 0 && <p className="lab-muted">The query returned zero matching rows.</p>}
              </div>
            )}

            {/* TAB 2: Formatted SQL Statement */}
            {mode === 'sql' && (
              <pre className="lab-code" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {output.statement}
                {'\n\n-- Bound Parameters (SQL Prepared Statement):\n'}
                {JSON.stringify(output.parameters, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default QueryWorkbench;
