import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../common/apiClient';
import { useAuth } from '../auth/AuthContext';
import {
  UserCheck,
  MessageSquare,
  AlertCircle,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Trash2,
  CheckCheck,
} from 'lucide-react';
import { incidentsService } from './incidentsService';

export interface DeskIncident {
  id: number;
  code: string;
  status: string;
  description: string;
  assigned_to: number | null;
  worker: string | null;
  acceptance: string;
}

export interface DeskData {
  incidents: DeskIncident[];
  workers: { id: number; name: string; role: string }[];
}

export interface ChatMessage {
  id: number;
  text: string;
  sender: string;
  at: string;
}

interface IncidentDeskProps {
  initialSelectedId?: number;
  onSelectIncident?: (id: number) => void;
  onIncidentDeleted?: (id: number) => void;
  onIncidentStatusChanged?: () => void;
}

export function IncidentDesk({
  initialSelectedId,
  onSelectIncident,
  onIncidentDeleted,
  onIncidentStatusChanged,
}: IncidentDeskProps) {
  const { user } = useAuth();
  const manager = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const [data, setData] = useState<DeskData>();
  const [selected, setSelected] = useState<number | undefined>(initialSelectedId);
  const [worker, setWorker] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'mine' | 'pending'>('all');

  const refresh = useCallback(async () => {
    const result = await apiRequest<DeskData>('/incident-desk');
    setData(result);
    setSelected((prev) => {
      if (prev && result.incidents.some((r) => r.id === prev)) return prev;
      return result.incidents[0]?.id;
    });
  }, []);

  const loadMessages = useCallback(async () => {
    if (selected) {
      try {
        const msgs = await apiRequest<ChatMessage[]>(`/incident-desk/${selected}/messages`);
        setMessages(msgs);
      } catch (e) {
        console.error('Failed to load incident messages', e);
      }
    }
  }, [selected]);

  useEffect(() => {
    let active = true;
    const reload = () => refresh().catch((err) => { if (active) setError(err.message); });
    reload();
    const timer = window.setInterval(reload, 12000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (initialSelectedId && initialSelectedId !== selected) {
      setSelected(initialSelectedId);
    }
  }, [initialSelectedId, selected]);

  useEffect(() => {
    setMessages([]);
    setWorker('');
    setLive(false);
    if (!selected) return;

    let active = true;
    loadMessages().catch((err) => { if (active) setError(err.message); });

    const base = new URL(import.meta.env.VITE_API_BASE_URL || '/api/v1', window.location.origin);
    const socket = new WebSocket(
      `${base.protocol === 'https:' ? 'wss:' : 'ws:'}//${base.host}${base.pathname.replace(/\/$/, '')}/incident-desk/${selected}/live`
    );

    socket.onopen = () => socket.send(JSON.stringify({ token: localStorage.getItem('samplemind_token') }));
    socket.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (update.event === 'connected') setLive(true);
        if (update.event === 'incident_changed') {
          setNotice('Incident activity updated in real-time.');
          Promise.all([refresh(), loadMessages()]).catch((err) => { if (active) setError(err.message); });
          if (onIncidentStatusChanged) onIncidentStatusChanged();
        }
      } catch {
        // ignore non-json
      }
    };
    socket.onclose = () => { if (active) setLive(false); };

    const timer = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send('heartbeat');
      loadMessages().catch((err) => { if (active) setError(err.message); });
    }, 20000);

    return () => { active = false; socket.close(); window.clearInterval(timer); };
  }, [selected, refresh, loadMessages, onIncidentStatusChanged]);

  async function action(endpoint: string, payload: unknown) {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await apiRequest<{ message: string }>(`/incident-desk/${selected}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setNotice(response.message);
      await refresh();
      if (endpoint === 'messages') {
        setText('');
        await loadMessages();
      }
      if (endpoint === 'complete-investigation' || endpoint === 'respond' || endpoint === 'assign') {
        if (onIncidentStatusChanged) onIncidentStatusChanged();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteIncident(incidentItem: DeskIncident) {
    if (!window.confirm(`Are you sure you want to permanently delete Incident ${incidentItem.code}? This will remove it across both the assignment desk and the main incidents table.`)) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await incidentsService.deleteIncident(incidentItem.id);
      setNotice(`Incident ${incidentItem.code} deleted successfully.`);
      if (selected === incidentItem.id) {
        setSelected(undefined);
      }
      if (onIncidentDeleted) onIncidentDeleted(incidentItem.id);
      if (onIncidentStatusChanged) onIncidentStatusChanged();
      await refresh();
    } catch (err) {
      setError((err as Error).message || 'Failed to delete incident.');
    } finally {
      setBusy(false);
    }
  }

  function handleSelectIncident(id: number) {
    setSelected(id);
    setNotice('');
    if (onSelectIncident) onSelectIncident(id);
  }

  const incident = data?.incidents.find((row) => row.id === selected);
  const pendingCount = data?.incidents.filter((row) => row.assigned_to === user?.user_id && row.acceptance === 'assigned').length ?? 0;

  // Filter top 2 roles (ADMIN & RESEARCHER) strictly for assignment
  const allowedWorkers = (data?.workers || []).filter(
    (w) => w.role.toUpperCase() === 'ADMIN' || w.role.toUpperCase() === 'RESEARCHER'
  );

  const displayedIncidents = (data?.incidents || []).filter((inc) => {
    if (filterMode === 'mine') return inc.assigned_to === user?.user_id;
    if (filterMode === 'pending') return inc.acceptance === 'assigned';
    return true;
  });

  function renderAcceptanceBadge(acceptance: string) {
    const acc = acceptance.toLowerCase();
    if (acc === 'accepted') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: '#DCFCE7',
            color: '#15803D',
            borderColor: '#86EFAC',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={12} /> Accepted & Investigating
        </span>
      );
    }
    if (acc === 'investigation_completed') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: '#E0F2FE',
            color: '#0369A1',
            borderColor: '#BAE6FD',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          <CheckCheck size={12} /> Investigation Completed
        </span>
      );
    }
    if (acc === 'declined') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: '#FEE2E2',
            color: '#B91C1C',
            borderColor: '#FCA5A5',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          <XCircle size={12} /> Declined
        </span>
      );
    }
    if (acc === 'assigned') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: '#FEF3C7',
            color: '#B45309',
            borderColor: '#FCD34D',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          <Clock size={12} /> Pending Acceptance
        </span>
      );
    }
    return <span className="badge badge-neutral">{acceptance}</span>;
  }

  function formatTime(isoString: string): string {
    if (!isoString) return '';
    try {
      const normalized = (isoString.includes('Z') || isoString.includes('+') || (isoString.length > 19 && isoString.slice(19).includes('-')))
        ? isoString
        : `${isoString}Z`;
      const date = new Date(normalized);
      if (isNaN(date.getTime())) return isoString;
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  }

  function send(event: FormEvent) {
    event.preventDefault();
    if (text.trim()) void action('messages', { text: text.trim() });
  }

  // Strictly the assigned investigator (not the manager/assigner unless self-assigned) can mark done
  const isAssignedInvestigator = incident?.assigned_to === user?.user_id;
  const canMarkDone =
    incident &&
    isAssignedInvestigator &&
    (incident.acceptance === 'accepted' || incident.status === 'investigating') &&
    incident.status !== 'closed' &&
    incident.status !== 'mitigated';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Desk Header & Alert Bar */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-pale-teal)',
              color: 'var(--color-teal)',
            }}
          >
            <UserCheck size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
              Staff Assignment & Incident Communications Desk
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              Restricted to verified lead investigators (<Shield size={11} style={{ display: 'inline' }} /> ADMIN & RESEARCHER)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`badge ${live ? 'badge-teal' : 'badge-neutral'}`} style={{ fontSize: '11px' }}>
            {live ? '● WebSocket Live Connected' : '○ Polling Synced'}
          </span>
          {pendingCount > 0 && (
            <span
              className="badge"
              style={{
                backgroundColor: '#FEF3C7',
                color: '#B45309',
                borderColor: '#FCD34D',
                fontWeight: 600,
                fontSize: '11px',
              }}
            >
              {pendingCount} Pending Response
            </span>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#FDF2F2',
            border: '1px solid #F87171',
            borderRadius: '6px',
            color: '#B91C1C',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--color-pale-teal)',
            border: '1px solid var(--color-teal)',
            borderRadius: '6px',
            color: 'var(--color-teal)',
            fontSize: '13px',
          }}
        >
          {notice}
        </div>
      )}

      {/* Main Split Dispatch Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px' }}>
        {/* Left Column: Incidents Directory with filter tabs */}
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
              Active Queue ({displayedIncidents.length})
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`btn ${filterMode === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('pending')}
                className={`btn ${filterMode === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('mine')}
                className={`btn ${filterMode === 'mine' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
              >
                Mine
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '560px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {displayedIncidents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-muted)', fontSize: '13px' }}>
                No incidents in this view.
              </div>
            ) : (
              displayedIncidents.map((row) => {
                const isSelected = row.id === selected;
                return (
                  <div
                    key={row.id}
                    onClick={() => handleSelectIncident(row.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--color-teal)' : '1px solid var(--color-border)',
                      backgroundColor: isSelected ? 'var(--color-pale-teal)' : '#FFFFFF',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span className="font-mono" style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-ink)' }}>
                        {row.code}
                      </span>
                      {renderAcceptanceBadge(row.acceptance)}
                    </div>
                    <p
                      style={{
                        fontSize: '12px',
                        color: 'var(--color-muted)',
                        margin: '0 0 8px 0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.description}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                      <span style={{ color: 'var(--color-ink)', fontWeight: 500 }}>
                        Assignee: <strong>{row.worker || 'Unassigned'}</strong>
                      </span>
                      <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                        {row.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Incident Assignment Controls & Communications Thread */}
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {incident ? (
            <>
              {/* Incident Header & Assignment Banner */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="font-mono" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-teal)' }}>
                        {incident.code}
                      </span>
                      {renderAcceptanceBadge(incident.acceptance)}
                      <span className="badge badge-neutral">{incident.status}</span>
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: 'var(--color-ink)' }}>
                      {incident.description}
                    </p>
                  </div>

                  {/* Top-Right Quick Actions: Delete Incident from Desk */}
                  {manager && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDeleteIncident(incident)}
                      className="btn btn-secondary"
                      title="Delete this incident permanently"
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        color: '#B91C1C',
                        borderColor: '#FCA5A5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Trash2 size={13} /> Delete Incident
                    </button>
                  )}
                </div>

                {/* Assignment Decision Box for Assigned User */}
                {incident.assigned_to === user?.user_id && incident.acceptance === 'assigned' && (
                  <div
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#FFFBEB',
                      border: '1px solid #FCD34D',
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#B45309' }}>
                        Assignment Requested: Will you accept responsibility for this incident?
                      </div>
                      <div style={{ fontSize: '11px', color: '#92400E' }}>
                        Accepting will begin investigation and mark status as accepted.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy || incident.status === 'closed'}
                        onClick={() => action('respond', { accept: true })}
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                      >
                        <CheckCircle2 size={13} style={{ marginRight: '4px' }} /> Accept Investigation
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy || incident.status === 'closed'}
                        onClick={() => action('respond', { accept: false })}
                        style={{ fontSize: '12px', padding: '6px 12px', color: '#B91C1C', borderColor: '#FCA5A5' }}
                      >
                        <XCircle size={13} style={{ marginRight: '4px' }} /> Decline
                      </button>
                    </div>
                  </div>
                )}

                {/* If declined, display a clean prominent notice */}
                {incident.acceptance === 'declined' && (
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FCA5A5',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#991B1B',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>
                      Assignment was <strong>declined</strong> by <strong>{incident.worker}</strong>. Please re-assign this incident to another investigator.
                    </span>
                  </div>
                )}

                {/* Done Investigating Action Banner for Accepted Investigator */}
                {canMarkDone && (
                  <div
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #86EFAC',
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#15803D' }}>
                        Investigation in progress by {incident.worker}
                      </div>
                      <div style={{ fontSize: '11px', color: '#166534' }}>
                        Finished investigating? Click to complete the investigation and update the incident status to Mitigated.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => action('complete-investigation', {})}
                      style={{
                        fontSize: '12px',
                        padding: '6px 14px',
                        backgroundColor: '#16A34A',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <CheckCheck size={14} /> Done Investigating
                    </button>
                  </div>
                )}

                {/* Assign Investigator Control (strictly Admin & Researcher roles) */}
                {manager && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)' }}>
                      Dispatch Lead Investigator (Admin / Researcher):
                    </label>
                    <select
                      className="input"
                      value={worker}
                      disabled={busy || incident.status === 'closed'}
                      onChange={(e) => setWorker(e.target.value)}
                      style={{ fontSize: '13px', minWidth: '220px' }}
                    >
                      <option value="">Select Qualified Staff...</option>
                      {allowedWorkers.map((person) => (
                        <option value={person.id} key={person.id}>
                          {person.name} ({person.role})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || !worker || incident.status === 'closed'}
                      onClick={() => action('assign', { worker_id: Number(worker) })}
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      Assign Staff
                    </button>
                  </div>
                )}
              </div>

              {/* Communications Thread */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '300px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <MessageSquare size={16} color="var(--color-teal)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
                    Incident Investigation Thread ({messages.length})
                  </span>
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--color-background)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '16px',
                    height: '280px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                  aria-live="polite"
                >
                  {messages.length === 0 ? (
                    <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--color-muted)', fontSize: '13px' }}>
                      No messages recorded in this incident investigation yet.
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          padding: '10px 14px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid var(--color-border)',
                          borderRadius: '6px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '12px', color: 'var(--color-teal)' }}>{msg.sender}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                            {formatTime(msg.at)}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', whiteSpace: 'pre-wrap', color: 'var(--color-ink)' }}>
                          {msg.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Message input */}
                <form onSubmit={send} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Type an update or question for investigators..."
                    value={text}
                    maxLength={2000}
                    disabled={busy || incident.status === 'closed'}
                    onChange={(e) => setText(e.target.value)}
                    style={{ flex: 1, fontSize: '13px' }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !text.trim() || incident.status === 'closed'}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                  >
                    <Send size={14} /> Send
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-muted)' }}>
              Select an incident from the queue to review assignment and messages.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
