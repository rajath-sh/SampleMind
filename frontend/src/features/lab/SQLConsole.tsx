import { useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';
import { ShieldCheck, Key, Terminal, Lock, CheckCircle2, AlertTriangle, LogOut } from 'lucide-react';

interface Output {
  committed: boolean;
  changes: number;
  message: string;
  results: { statement: number; message: string; columns: string[]; rows: unknown[][]; truncated?: boolean }[];
  role?: string;
  role_name?: string;
}

interface RoleConfig {
  passkey: string;
  role: string;
  name: string;
  username: string;
  badgeColor: string;
  description: string;
  allowed: string[];
  denied: string[];
}

const ROLES: Record<string, RoleConfig> = {
  '1': {
    passkey: '1',
    role: 'ADMIN',
    name: 'Administrator (DBA)',
    username: 'root@localhost',
    badgeColor: 'var(--color-teal)',
    description: 'Full DBA Privileges: DDL (CREATE, ALTER, DROP, TRUNCATE), DML (SELECT, INSERT, UPDATE, DELETE), DCL (GRANT, REVOKE), and TCL (START TRANSACTION, COMMIT, ROLLBACK).',
    allowed: ['*'],
    denied: [],
  },
  '2': {
    passkey: '2',
    role: 'RESEARCHER',
    name: 'Researcher / Data Scientist',
    username: 'researcher@localhost',
    badgeColor: '#2563EB',
    description: 'Analytical Queries: SELECT, Complex Multi-table JOINs, Nested Subqueries, Aggregates, GROUP BY, and CTEs. Schema changes and record deletions are blocked.',
    allowed: ['SELECT', 'WITH', 'EXPLAIN', 'DESCRIBE', 'DESC', 'SHOW'],
    denied: ['DROP', 'ALTER', 'TRUNCATE', 'DELETE', 'INSERT', 'UPDATE', 'GRANT', 'REVOKE', 'CREATE'],
  },
  '3': {
    passkey: '3',
    role: 'TECHNICIAN',
    name: 'Lab Technician / Operator',
    username: 'technician@localhost',
    badgeColor: '#D97706',
    description: 'Operational Data Entry: SELECT, INSERT, UPDATE, and Transaction Control (START TRANSACTION, COMMIT, ROLLBACK). Dropping tables or schema modification prohibited.',
    allowed: ['SELECT', 'INSERT', 'UPDATE', 'START', 'BEGIN', 'COMMIT', 'ROLLBACK', 'DESCRIBE', 'DESC', 'SHOW'],
    denied: ['DROP', 'ALTER', 'TRUNCATE', 'DELETE', 'GRANT', 'REVOKE', 'CREATE'],
  },
  '4': {
    passkey: '4',
    role: 'GUEST',
    name: 'Guest Auditor / Student',
    username: 'guest@localhost',
    badgeColor: '#64748B',
    description: 'Read-Only Audit: SELECT queries only. Data mutations, deletions, and schema modifications are strictly blocked.',
    allowed: ['SELECT', 'DESCRIBE', 'DESC', 'SHOW'],
    denied: ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE'],
  },
};

const ROLE_EXAMPLES: Record<string, [string, string][]> = {
  '1': [
    ['Show Tables (MySQL)', 'SHOW TABLES;'],
    ['Describe Specimen Table', 'DESCRIBE Sample;'],
    [
      '[DDL] Create Practice Table',
      'CREATE TABLE IF NOT EXISTS LabPractice (\n  practice_id INT AUTO_INCREMENT PRIMARY KEY,\n  topic_name VARCHAR(100) NOT NULL,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\nINSERT INTO LabPractice (topic_name) VALUES (\'RVCE DBMS Part-B Exercise\');\nSELECT * FROM LabPractice;',
    ],
    [
      '[TCL] Transaction Test (Rollback)',
      'START TRANSACTION;\nUPDATE Sample SET notes = \'Audit verified\' WHERE sample_code = \'S003\';\nSELECT sample_code, notes FROM Sample WHERE sample_code = \'S003\';\nROLLBACK;',
    ],
  ],
  '2': [
    ['Show Tables (MySQL)', 'SHOW TABLES;'],
    ['Describe Specimen Table', 'DESCRIBE Sample;'],
    [
      '[Analysis] Multi-Table Join & Aggregate',
      'SELECT t.type_name, COUNT(s.sample_id) AS total_samples, AVG(s.quantity_value) AS avg_quantity\nFROM Sample s\nJOIN SampleType t ON s.sample_type_id = t.sample_type_id\nGROUP BY t.type_name\nORDER BY total_samples DESC;',
    ],
    [
      '[Analysis] Nested Subquery (Above Average)',
      'SELECT sample_code, sample_name, quantity_value\nFROM Sample\nWHERE quantity_value > (SELECT AVG(quantity_value) FROM Sample WHERE quantity_value IS NOT NULL)\nLIMIT 10;',
    ],
    [
      '[Analysis] Recursive CTE Lineage',
      'WITH RECURSIVE SpecimenLineage AS (\n  SELECT parent_sample_id, child_sample_id, transformation_type, 1 AS depth\n  FROM SampleRelationship\n  UNION ALL\n  SELECT r.parent_sample_id, r.child_sample_id, r.transformation_type, l.depth + 1\n  FROM SampleRelationship r\n  JOIN SpecimenLineage l ON r.parent_sample_id = l.child_sample_id\n)\nSELECT * FROM SpecimenLineage LIMIT 10;',
    ],
  ],
  '3': [
    ['Show Tables (MySQL)', 'SHOW TABLES;'],
    ['Describe Storage Table', 'DESCRIBE StorageLocation;'],
    [
      '[Operational] Query Active Storage',
      'SELECT location_code, unit_type, is_active FROM StorageLocation WHERE is_active = TRUE LIMIT 10;',
    ],
    [
      '[Operational] Update Specimen Notes',
      'UPDATE Sample SET notes = \'Technician checked temperature compliance\' WHERE sample_code = \'S003\';\nSELECT sample_code, notes FROM Sample WHERE sample_code = \'S003\';',
    ],
    [
      '[Operational] Record New QC Assay Run',
      'INSERT INTO SampleTest (sample_id, test_type, test_status, result_interpretation, requested_at, performed_at)\nVALUES (1, \'DNA_SEQUENCING\', \'completed\', \'pass\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);\nSELECT * FROM SampleTest ORDER BY sample_test_id DESC LIMIT 1;',
    ],
  ],
  '4': [
    ['Show Tables (MySQL)', 'SHOW TABLES;'],
    ['Describe Specimen Table', 'DESCRIBE Sample;'],
    [
      '[Auditor] Inspect Biological Specimens',
      'SELECT sample_code, sample_name, sample_status, quantity_value, quantity_unit\nFROM Sample\nLIMIT 10;',
    ],
    [
      '[Auditor] Inspect Safety Incident Log',
      'SELECT incident_code, severity, status, description\nFROM Incident\nLIMIT 10;',
    ],
  ],
};

export function SQLConsole({ initialSql }: { initialSql?: string }) {
  // Authentication & session state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passkey, setPasskey] = useState<string>('');
  const [loginInput, setLoginInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  // Terminal & execution state
  const [sql, setSQL] = useState(initialSql ?? ROLE_EXAMPLES['1'][0][1]);
  const [output, setOutput] = useState<Output>();
  const [schema, setSchema] = useState<{ name: string; type: string; sql: string }[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSchema, setShowSchema] = useState(false);

  useEffect(() => {
    if (initialSql) setSQL(initialSql);
  }, [initialSql]);

  async function loadSchema() {
    try {
      const data = await apiRequest<typeof schema>('/sql-console/schema');
      setSchema(data);
    } catch {
      // Optional schema load
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadSchema();
    }
  }, [isAuthenticated]);

  const activeRole = ROLES[passkey] || ROLES['4'];

  // Handle password login authentication (Authentic MySQL CLI behavior)
  function handleLogin(keyToTest: string) {
    const clean = keyToTest.trim();
    if (ROLES[clean]) {
      setPasskey(clean);
      setIsAuthenticated(true);
      setLoginError('');
      setError('');
      setOutput(undefined);
      // Load standard starting query for this role
      if (ROLE_EXAMPLES[clean]?.[0]) {
        setSQL(ROLE_EXAMPLES[clean][0][1]);
      }
    } else {
      setLoginError(
        `ERROR 1045 (28000): Access denied for user (using password: YES).\nValid role passwords: Admin: 1 | Researcher: 2 | Technician: 3 | Guest: 4`
      );
    }
  }

  function handleLogout() {
    setIsAuthenticated(false);
    setPasskey('');
    setLoginInput('');
    setLoginError('');
    setError('');
    setOutput(undefined);
  }

  async function execute(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    const trimmed = sql.trim();
    if (!trimmed) {
      setError('Please enter a SQL statement.');
      return;
    }

    // Check for exit / quit / logout commands in terminal
    const checkUpper = trimmed.toUpperCase().replace(/;/g, '').trim();
    if (['EXIT', 'QUIT', '\Q', 'LOGOUT'].includes(checkUpper)) {
      handleLogout();
      return;
    }

    // Role-Based Command Permission Inspection
    const firstWord = trimmed.split(/[\s(;]+/)[0].toUpperCase();
    if (activeRole.denied.includes(firstWord)) {
      setError(
        `ERROR 1142 (42000): ${firstWord} command denied to user '${activeRole.username}' for table. Full DBA authorization (Password: 1) is required.`
      );
      return;
    }

    if (activeRole.allowed[0] !== '*' && !activeRole.allowed.includes(firstWord)) {
      setError(
        `ERROR 1142 (42000): Statement '${firstWord}' is not permitted for role '${activeRole.name}'. Permitted operations: ${activeRole.allowed.join(', ')}.`
      );
      return;
    }

    setBusy(true);
    setError('');
    setOutput(undefined);

    try {
      const result = await apiRequest<Output>('/sql-console', {
        method: 'POST',
        body: JSON.stringify({ sql, passkey }),
      });
      setOutput(result);
      setHistory(previous => [sql, ...previous.filter(c => c !== sql)].slice(0, 15));
      if (result.committed) {
        window.dispatchEvent(new Event('samplemind-data-changed'));
        await loadSchema();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const currentExamples = ROLE_EXAMPLES[passkey] || ROLE_EXAMPLES['1'];

  return (
    <div className="lab-stack">
      {/* STATE 1: COMMAND LINE PASSWORD PROMPT (BEFORE SESSION STARTS) */}
      {!isAuthenticated ? (
        <section
          className="card"
          style={{
            padding: '24px',
            backgroundColor: '#0F172A',
            color: '#F8FAFC',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          {/* Authentic MySQL Terminal Login Banner */}
          <div style={{ color: '#38BDF8', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
            <div>MySQL 8.0.36 Community Server (GPL) - RVCE DBMS Laboratory Part-B</div>
            <div>Copyright (c) 2000, 2026, Oracle and/or its affiliates.</div>
            <div style={{ color: '#94A3B8', marginTop: '6px' }}>
              Connection target: <span style={{ color: '#A7F3D0' }}>samplemind_lims</span> on localhost:3306
            </div>
          </div>

          <div style={{ borderTop: '1px solid #334155', paddingTop: '16px', marginBottom: '16px' }}>
            <div style={{ color: '#E2E8F0', fontSize: '13px', marginBottom: '8px' }}>
              $ mysql -u client -p
            </div>

            {/* In-Line Command Prompt for Password */}
            <form
              onSubmit={e => {
                e.preventDefault();
                handleLogin(loginInput);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
            >
              <span style={{ color: '#38BDF8', fontWeight: 700, fontSize: '14px' }}>
                Enter password:
              </span>
              <input
                type="password"
                autoFocus
                value={loginInput}
                placeholder="Enter 1, 2, 3 or 4"
                maxLength={10}
                onChange={e => setLoginInput(e.target.value)}
                style={{
                  backgroundColor: '#1E293B',
                  color: '#38BDF8',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  width: '180px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ padding: '6px 16px', fontSize: '13px' }}
              >
                Authenticate & Connect
              </button>
            </form>

            {loginError && (
              <pre
                style={{
                  marginTop: '12px',
                  color: '#F87171',
                  fontSize: '12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {loginError}
              </pre>
            )}
          </div>

          {/* Explicit In-Place Role & Password Matrix Mention */}
          <div
            style={{
              backgroundColor: '#1E293B',
              borderRadius: '8px',
              padding: '16px',
              border: '1px solid #334155',
              marginTop: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#F1F5F9', fontSize: '13px', fontWeight: 600 }}>
              <Key size={16} color="#38BDF8" />
              <span>Registered Database Users, Passwords & Operational Roles:</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
              {Object.values(ROLES).map(r => (
                <div
                  key={r.passkey}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: '#0F172A',
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ color: r.badgeColor, fontWeight: 700, fontSize: '12px' }}>
                        {r.name}
                      </span>
                      <span
                        style={{
                          backgroundColor: '#334155',
                          color: '#F8FAFC',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        Password: {r.passkey}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                      User: <strong>{r.username}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: '#CBD5E1', marginTop: '6px', lineHeight: 1.4 }}>
                      {r.description}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleLogin(r.passkey)}
                    style={{
                      marginTop: '10px',
                      padding: '5px 10px',
                      backgroundColor: '#334155',
                      color: '#F8FAFC',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'background 0.2s ease',
                    }}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = '#475569')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = '#334155')}
                  >
                    <Lock size={12} /> Connect as {r.name.split(' ')[0]} (Pass: {r.passkey})
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        /* STATE 2: AUTHENTICATED MYSQL INTERACTIVE SESSION */
        <div className="lab-stack">
          {/* Active Session Status & Role Bar */}
          <section
            className="card"
            style={{
              padding: '14px 20px',
              borderLeft: `5px solid ${activeRole.badgeColor}`,
              backgroundColor: '#FFFFFF',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={20} color={activeRole.badgeColor} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--color-ink)' }}>
                    MySQL Session Active: {activeRole.username}
                  </strong>
                  <span
                    className="badge"
                    style={{
                      backgroundColor: `${activeRole.badgeColor}15`,
                      color: activeRole.badgeColor,
                      fontWeight: 700,
                      fontSize: '11px',
                    }}
                  >
                    {activeRole.name} · Password: {activeRole.passkey}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                  Database: <span className="font-mono">samplemind_lims</span> • {activeRole.description}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#B91C1C',
                borderColor: '#FCA5A5',
              }}
              title="Type 'exit;' in terminal or click to switch role"
            >
              <LogOut size={14} /> Disconnect / Switch Role
            </button>
          </section>

          {/* Interactive Command Terminal */}
          <section className="card lab-panel">
            <div className="lab-title">
              <Terminal size={20} />
              <h2>MySQL Interactive Command Terminal</h2>
              <ConceptInfo
                title="MySQL 8.0 Execution & RVCE Syllabus Traceability"
                steps={['Role Password Auth', 'Parse Statement', 'START TRANSACTION', 'Execute Queries', 'COMMIT or ROLLBACK']}
              >
                <p>
                  Authenticated session for {activeRole.username}. Enter standard SQL statements ending with a semicolon.
                </p>
                <p>
                  Type <code>exit;</code> or <code>quit;</code> to log out and switch to another role password.
                </p>
              </ConceptInfo>
            </div>

            {/* Role-Specific Allowed Command Presets */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Permitted SQL Templates for {activeRole.name}:
              </div>
              <div className="lab-chips">
                {currentExamples.map(([label, value]) => (
                  <button className="btn-secondary" type="button" key={label} disabled={busy} onClick={() => setSQL(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Query Form */}
            <form onSubmit={execute} style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label className="sql-prompt" htmlFor="sql-input">
                  mysql&gt;
                </label>
                <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                  Execute: <kbd style={{ padding: '2px 5px', borderRadius: '4px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1' }}>Ctrl + Enter</kbd> · Type <code>exit;</code> to logout
                </span>
              </div>

              <textarea
                id="sql-input"
                className="sql-terminal"
                spellCheck={false}
                rows={9}
                value={sql}
                disabled={busy}
                onChange={event => setSQL(event.target.value)}
                onKeyDown={event => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <button className="btn-primary" type="submit" disabled={busy || !sql.trim()}>
                  {busy ? 'Executing Query…' : 'Execute Statement · Ctrl Enter'}
                </button>
                <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                  Connected: <strong>{activeRole.username}</strong>
                </span>
              </div>
            </form>

            {/* Error Display */}
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '12px',
                }}
                role="alert"
              >
                <AlertTriangle size={18} color="#DC2626" />
                <span style={{ fontSize: '13px', color: '#B91C1C', fontWeight: 500, fontFamily: 'monospace' }}>
                  {error}
                </span>
              </div>
            )}

            {/* Results Table */}
            {output && (
              <div className="lab-stack" style={{ width: '100%', marginTop: '16px' }} aria-live="polite">
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#15803D',
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    {output.message} · {output.changes} row(s) affected
                  </span>
                </div>

                {output.results.map(result => (
                  <div key={result.statement} style={{ marginTop: '10px' }}>
                    <p className="sql-prompt" style={{ marginBottom: '6px' }}>
                      Statement {result.statement} · {result.message}
                      {result.truncated ? ' · first 200 rows shown' : ''}
                    </p>
                    {result.columns.length > 0 && (
                      <div className="lab-table-wrap">
                        <table className="lab-table">
                          <thead>
                            <tr>
                              {result.columns.map((column, index) => (
                                <th key={index}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.rows.map((row, index) => (
                              <tr key={index}>
                                {row.map((value, cell) => (
                                  <td key={cell}>
                                    {value === null
                                      ? 'NULL'
                                      : typeof value === 'object'
                                      ? JSON.stringify(value)
                                      : String(value)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Database Schema Drawer */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setShowSchema(!showSchema)}
                aria-expanded={showSchema}
              >
                {showSchema ? 'Hide Relational Schema' : 'Inspect Relational Schema'}
              </button>
            </div>

            {showSchema && (
              <div style={{ width: '100%', marginTop: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '8px' }}>
                  DDL Definitions for Registered Relational Entities:
                </div>
                {schema.map(item => (
                  <details key={item.name} style={{ marginBottom: '6px' }}>
                    <summary style={{ fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                      {item.type.toUpperCase()} · {item.name}
                    </summary>
                    <pre className="lab-code" style={{ marginTop: '4px' }}>
                      {item.sql}
                    </pre>
                  </details>
                ))}
              </div>
            )}

            {/* Command History */}
            {history.length > 0 && (
              <details style={{ width: '100%', marginTop: '14px' }}>
                <summary style={{ fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  Session Query History ({history.length})
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                  {history.map((command, index) => (
                    <button
                      className="query-preset"
                      type="button"
                      key={index}
                      onClick={() => setSQL(command)}
                      style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: '12px' }}
                    >
                      {command.replace(/\n/g, ' ')}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default SQLConsole;
