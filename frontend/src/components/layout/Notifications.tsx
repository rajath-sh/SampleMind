import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { apiRequest } from '../../common/apiClient';
import { useAuth } from '../../features/auth/AuthContext';

interface Notice { id: number; action: string; code: string; at: string }
export function Notifications({ onOpenIncidents }: { onOpenIncidents: () => void }) {
  const { user } = useAuth();
  const key = `samplemind-notice-read-${user?.user_id}`;
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(Number(localStorage.getItem(key) || 0));
  const [error, setError] = useState('');
  useEffect(() => {
    setSeen(Number(localStorage.getItem(key) || 0));
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = await apiRequest<Notice[]>('/incident-desk/notifications/recent', { signal: controller.signal });
        setItems(result); setError('');
      } catch (err) { if (!controller.signal.aborted) setError((err as Error).message); }
    }
    refresh(); const timer = window.setInterval(refresh, 20000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [key]);
  const unread = items.filter(item => item.id > seen).length;
  return <div style={{ position: 'relative' }}>
    <button className="btn-secondary" type="button" aria-label={`Notifications, ${unread} unread`}
      aria-expanded={open} onClick={() => setOpen(!open)}><Bell size={16} />{unread > 0 && <span>{unread}</span>}</button>
    {open && <div className="card" style={{ position: 'absolute', right: 0, top: '110%', width: 'min(330px,80vw)', padding: 12, maxHeight: '60vh', overflow: 'auto', zIndex: 80 }}>
      <h3 style={{ fontSize: '1rem' }}>Incident notifications</h3>
      <p className="lab-muted">Checked every 20 seconds</p>
      {error && <p className="lab-error" role="alert">{error}</p>}
      {items.map(item => <button className="query-preset" type="button" key={item.id} onClick={() => {
        setOpen(false); onOpenIncidents();
      }}><strong>{item.code}</strong><span>{item.action.replace('INCIDENT_', '').replace(/_/g, ' ').toLowerCase()}</span>
        <small>{new Date(item.at).toLocaleString()}</small></button>)}
      {items.length === 0 && <p className="lab-muted">No recent activity for your role.</p>}
      <button className="btn-secondary" type="button" onClick={() => {
        const latest = Math.max(seen, ...items.map(item => item.id));
        setSeen(latest); localStorage.setItem(key, String(latest));
      }}>Mark displayed notifications read</button>
    </div>}
  </div>;
}
