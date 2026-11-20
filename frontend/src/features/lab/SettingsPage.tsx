import { useEffect, useState } from 'react';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';
import { useAuth } from '../auth/AuthContext';

export function SettingsPage() {
  const { user } = useAuth();
  const [reduceMotion, setReduceMotion] = useState(localStorage.getItem('samplemind_motion') === 'reduced');
  const [status, setStatus] = useState<{ sql: string; documents: string; status: string }>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    apiRequest<{ sql: string; documents: string; status: string }>('/lab/status', { signal: controller.signal })
      .then(setStatus).catch(err => { if (!controller.signal.aborted) { setStatus(undefined); setError(err.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  function updateMotion(checked: boolean) {
    setReduceMotion(checked);
    localStorage.setItem('samplemind_motion', checked ? 'reduced' : 'system');
    document.documentElement.dataset.motion = checked ? 'reduced' : 'system';
  }

  return (
    <div className="lab-stack">
      <header className="lab-hero"><div><div className="lab-kicker">WORKSPACE PREFERENCES</div>
        <h1>Settings</h1><p>Check database connectivity and set display preferences for this browser.</p></div>
        <div className="lab-hero-mark" aria-hidden="true"><SlidersHorizontal size={48} /></div>
      </header>
      <section className="card lab-panel">
        <div className="lab-title"><h2>Runtime and display</h2>
          <ConceptInfo title="Independent database engines" steps={['FastAPI session', 'Relational connection', 'Document storage', 'Readiness result']}>
            <p>The health check runs a small query on the active SQL engine and opens the TinyDB store separately.</p>
          </ConceptInfo>
        </div>
        <p>Signed in as <strong>{user?.display_name}</strong> · {user?.role}</p>
        <p className="lab-muted" role="status">{loading ? 'Checking database engines…' : status ? `${status.sql} · ${status.documents} · ${status.status}` : 'Database check failed.'}</p>
        {error && <p className="lab-error" role="alert">{error}</p>}
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>
          <RefreshCw size={15} /> Refresh status
        </button>
        <label className="lab-check"><input type="checkbox" checked={reduceMotion}
          onChange={event => updateMotion(event.target.checked)} /> Reduce workspace motion</label>
      </section>
    </div>
  );
}

