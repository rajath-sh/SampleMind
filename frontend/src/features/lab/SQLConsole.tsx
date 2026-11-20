import { useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../common/apiClient';
import { useAuth } from '../auth/AuthContext';
import { ConceptInfo } from '../../components/ConceptInfo';

interface Output {
  committed: boolean;
  changes: number;
  message: string;
  results: { statement: number; message: string; columns: string[]; rows: unknown[][]; truncated?: boolean }[];
}
const examples = [
  ['Read samples', 'SELECT sample_code, sample_name, quantity_value, quantity_unit FROM "Sample" LIMIT 10;'],
  ['Inspect columns', 'PRAGMA table_info("Sample");'],
  ['Transaction example', 'BEGIN;\nUPDATE "Sample" SET notes = notes WHERE sample_code = \'S003\';\nSELECT sample_code, notes FROM "Sample" WHERE sample_code = \'S003\';\nROLLBACK;'],
  ['Create practice table', 'CREATE TABLE IF NOT EXISTS ConsolePractice (id INTEGER PRIMARY KEY, label TEXT NOT NULL);\nINSERT INTO ConsolePractice(label) VALUES (\'DBMS exercise\');\nSELECT * FROM ConsolePractice;'],
];

export function SQLConsole({ initialSql }: { initialSql?: string }) {
  const { user } = useAuth();
  const [sql, setSQL] = useState(initialSql ?? examples[0][1]);
  const [output, setOutput] = useState<Output>();
  const [schema, setSchema] = useState<{ name: string; type: string; sql: string }[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSchema, setShowSchema] = useState(false);

  useEffect(() => { if (initialSql) setSQL(initialSql); }, [initialSql]);

  async function loadSchema() {
    setSchema(await apiRequest<typeof schema>('/sql-console/schema'));
  }
  useEffect(() => {
    if (user?.role === 'ADMIN') loadSchema().catch(err => setError(err.message));
  }, [user?.role]);

  async function execute(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setOutput(undefined);
    try {
      const result = await apiRequest<Output>('/sql-console', { method: 'POST', body: JSON.stringify({ sql }) });
      setOutput(result);
      setHistory(previous => [sql, ...previous].slice(0, 15));
      if (result.committed) {
        window.dispatchEvent(new Event('samplemind-data-changed'));
        await loadSchema();
      }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  if (user?.role !== 'ADMIN') return <p className="lab-muted">SQL Testing requires an administrator account.</p>;
  return <div className="lab-stack">
    <header className="lab-hero"><div><div className="lab-kicker">SQLITE · ADMINISTRATOR</div><h1>SQL Testing</h1>
      <p>Execute SQL against the same database used by the workspace.</p></div></header>
    <section className="card lab-panel">
      <div className="lab-title"><h2>Command terminal</h2>
        <ConceptInfo title="Atomic SQL submissions" steps={['Begin transaction', 'Execute commands', 'Commit or roll back', 'Reload workspace data']}>
          <p>A submission can contain SELECT, INSERT, UPDATE, DELETE and schema commands. All statements run in one transaction. Any error rolls back that submission. An explicit ROLLBACK at the end cancels it.</p>
          <p>Use SQLite syntax. Schema changes affect application tables directly. File attachments, extensions and writable PRAGMAs are disabled. Results display at most 200 rows per statement.</p>
        </ConceptInfo>
      </div>
      <p className="lab-muted">Committed commands change live records. Changing application columns can break their screens. Navigating back to a workspace tab reloads its data.</p>
      <div className="lab-chips">{examples.map(([label, value]) => <button className="btn-secondary" type="button" key={label}
        disabled={busy} onClick={() => setSQL(value)}>{label}</button>)}</div>
      <form onSubmit={execute} style={{ width: '100%' }}>
        <label className="sql-prompt" htmlFor="sql-input">sqlite&gt;</label>
        <textarea id="sql-input" className="sql-terminal" spellCheck={false} rows={10} value={sql}
          disabled={busy} onChange={event => setSQL(event.target.value)}
          onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault(); event.currentTarget.form?.requestSubmit();
          } }} />
        <button className="btn-primary" type="submit" disabled={busy || !sql.trim()}>{busy ? 'Executing…' : 'Execute · Ctrl Enter'}</button>
      </form>
      {error && <p className="lab-error" role="alert">{error}</p>}
      {output && <div className="lab-stack" style={{ width: '100%' }} aria-live="polite">
        <p className="lab-muted">{output.message} · {output.changes} change(s)</p>
        {output.results.map(result => <div key={result.statement}>
          <p className="sql-prompt">Statement {result.statement} · {result.message}{result.truncated ? ' · first 200 shown' : ''}</p>
          {result.columns.length > 0 && <div className="lab-table-wrap"><table className="lab-table">
            <thead><tr>{result.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead>
            <tbody>{result.rows.map((row, index) => <tr key={index}>{row.map((value, cell) =>
              <td key={cell}>{value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</td>)}</tr>)}</tbody>
          </table></div>}
        </div>)}
      </div>}
      <button className="btn-secondary" type="button" onClick={() => setShowSchema(!showSchema)} aria-expanded={showSchema}>Database schema</button>
      {showSchema && <div style={{ width: '100%' }}>{schema.map(item => <details key={item.name}>
        <summary>{item.type} · {item.name}</summary><pre className="lab-code">{item.sql}</pre>
      </details>)}</div>}
      {history.length > 0 && <details style={{ width: '100%' }}><summary>Session command history</summary>
        {history.map((command, index) => <button className="query-preset" type="button" key={index} onClick={() => setSQL(command)}>{command}</button>)}
      </details>}
    </section>
  </div>;
}
