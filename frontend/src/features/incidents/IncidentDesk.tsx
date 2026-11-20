import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../common/apiClient';
import { useAuth } from '../auth/AuthContext';

interface DeskIncident {
  id: number; code: string; status: string; description: string;
  assigned_to: number | null; worker: string | null; acceptance: string;
}
interface DeskData {
  incidents: DeskIncident[];
  workers: { id: number; name: string; role: string }[];
}
interface ChatMessage { id: number; text: string; sender: string; at: string }

export function IncidentDesk() {
  const { user } = useAuth();
  const manager = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const [data, setData] = useState<DeskData>();
  const [selected, setSelected] = useState<number>();
  const [worker, setWorker] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);

  const refresh = useCallback(async () => {
    const result = await apiRequest<DeskData>('/incident-desk');
    setData(result);
    setSelected(previous => result.incidents.some(row => row.id === previous) ? previous : result.incidents[0]?.id);
  }, []);
  const loadMessages = useCallback(async () => {
    if (selected) setMessages(await apiRequest<ChatMessage[]>(`/incident-desk/${selected}/messages`));
  }, [selected]);

  useEffect(() => {
    let active = true;
    const reload = () => refresh().catch(err => { if (active) setError(err.message); });
    reload();
    const timer = window.setInterval(reload, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    setMessages([]); setWorker(''); setLive(false);
    if (!selected) return;
    let active = true;
    loadMessages().catch(err => { if (active) setError(err.message); });
    const base = new URL(import.meta.env.VITE_API_BASE_URL || '/api/v1', window.location.origin);
    const socket = new WebSocket(`${base.protocol === 'https:' ? 'wss:' : 'ws:'}//${base.host}${base.pathname.replace(/\/$/, '')}/incident-desk/${selected}/live`);
    socket.onopen = () => socket.send(JSON.stringify({ token: localStorage.getItem('samplemind_token') }));
    socket.onmessage = event => {
      const update = JSON.parse(event.data);
      if (update.event === 'connected') setLive(true);
      if (update.event === 'incident_changed') {
        setNotice('New incident activity received.');
        Promise.all([refresh(), loadMessages()]).catch(err => { if (active) setError(err.message); });
      }
    };
    socket.onclose = () => { if (active) setLive(false); };
    const timer = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send('heartbeat');
      loadMessages().catch(err => { if (active) setError(err.message); });
    }, 20000);
    return () => { active = false; socket.close(); window.clearInterval(timer); };
  }, [selected, refresh, loadMessages]);

  async function action(endpoint: string, payload: unknown) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiRequest<{ message: string }>(`/incident-desk/${selected}/${endpoint}`, {
        method: 'POST', body: JSON.stringify(payload),
      });
      setNotice(response.message);
      await refresh();
      if (endpoint === 'messages') { setText(''); await loadMessages(); }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const incident = data?.incidents.find(row => row.id === selected);
  const pending = data?.incidents.filter(row => row.assigned_to === user?.user_id && row.acceptance === 'assigned').length ?? 0;
  function send(event: FormEvent) { event.preventDefault(); if (text.trim()) void action('messages', { text: text.trim() }); }

  return <section className="card lab-panel" style={{ marginBottom: '1rem' }}>
    <div className="lab-title"><h2>Staff assignment and conversation</h2>
      <span className="badge badge-neutral">{live ? 'Live updates connected' : 'Polling for updates'}</span>
      {pending > 0 && <span className="badge badge-warning" role="status">{pending} assignment(s) await your response</span>}
    </div>
    {error && <p className="lab-error" role="alert">{error}</p>}
    {notice && <p className="cryo-detail" role="status">{notice}</p>}
    <label className="search-label">Incident<select className="input-field" value={selected ?? ''}
      onChange={event => { setSelected(Number(event.target.value)); setNotice(''); }}>
      {!data?.incidents.length && <option value="">No accessible incidents</option>}
      {data?.incidents.map(row => <option key={row.id} value={row.id}>{row.code} · {row.acceptance}</option>)}
    </select></label>
    {incident && <>
      <p>{incident.description}</p>
      <p className="lab-muted">Assigned to {incident.worker ?? 'nobody'} · {incident.acceptance} · {incident.status}</p>
      {manager && <div className="lab-controls">
        <label>Assign worker<select className="input-field" value={worker} disabled={busy} onChange={event => setWorker(event.target.value)}>
          <option value="">Choose staff member</option>
          {data?.workers.map(person => <option value={person.id} key={person.id}>{person.name} · {person.role}</option>)}
        </select></label>
        <button className="btn-primary" type="button" disabled={busy || !worker || incident.status === 'closed'}
          onClick={() => action('assign', { worker_id: Number(worker) })}>Send assignment</button>
      </div>}
      {incident.assigned_to === user?.user_id && incident.acceptance === 'assigned' && <div className="lab-chips">
        <button className="btn-primary" type="button" disabled={busy || incident.status === 'closed'} onClick={() => action('respond', { accept: true })}>Accept assignment</button>
        <button className="btn-secondary" type="button" disabled={busy || incident.status === 'closed'} onClick={() => action('respond', { accept: false })}>Decline assignment</button>
      </div>}
      <div className="trace-rail" style={{ width: '100%' }} aria-live="polite">
        {messages.map(message => <article className="cryo-detail" key={message.id}><strong>{message.sender}</strong>
          <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p><small>{new Date(message.at).toLocaleString()}</small></article>)}
        {messages.length === 0 && <p className="lab-muted">No messages in this incident conversation.</p>}
      </div>
      <form className="lab-controls" onSubmit={send}>
        <label>Message<input className="input-field" value={text} maxLength={2000} required disabled={busy}
          onChange={event => setText(event.target.value)} /></label>
        <button className="btn-primary" type="submit" disabled={busy || !text.trim()}>Send message</button>
      </form>
    </>}
  </section>;
}
