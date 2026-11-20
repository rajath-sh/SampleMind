import { IncidentDesk } from './IncidentDesk';
import { DatabaseConcept } from '../../components/DatabaseConcept';
import { CompactTable } from '../../components/CompactTable';
import { useAuth } from '../auth/AuthContext';
import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Flame,
  Search,
  Plus,
  RefreshCw,
  X,
  CheckCircle2,
  Filter,
  Layers,
  TestTubes,
  FileText,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { incidentsService } from './incidentsService';
import {
  IncidentListItem,
  IncidentDetail,
  IncidentCreatePayload,
  IncidentUpdatePayload,
  IncidentBlastRadiusResponse,
} from './types';

export const IncidentsPage: React.FC<{ initialSearch?: string }> = ({ initialSearch = '' }) => {
  // Incident catalog states
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const canReport = canWrite || user?.role === 'TECHNICIAN';
  const [incidents, setIncidents] = useState<IncidentListItem[]>([]);
  const [totalIncidents, setTotalIncidents] = useState(0);
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selected Incident Dossier State
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<IncidentDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Blast Radius Modal State
  const [blastRadiusIncidentId, setBlastRadiusIncidentId] = useState<number | null>(null);
  const [blastRadiusData, setBlastRadiusData] = useState<IncidentBlastRadiusResponse | null>(null);
  const [isBlastLoading, setIsBlastLoading] = useState(false);

  // Modals State
  const [isNewIncidentModalOpen, setIsNewIncidentModalOpen] = useState(false);
  const [isCapaModalOpen, setIsCapaModalOpen] = useState(false);

  // Form states
  const [newIncidentForm, setNewIncidentForm] = useState<IncidentCreatePayload>({
    incident_code: '',
    sample_id: undefined,
    storage_location_id: undefined,
    incident_type: 'contamination',
    severity: 'critical',
    description: '',
    occurred_at: new Date().toISOString().slice(0, 16),
    quarantine_descendants: true,
  });

  const [capaForm, setCapaForm] = useState<IncidentUpdatePayload>({
    status: 'investigating',
    resolution_notes: '',
  });

  // Fetch incidents
  const loadIncidents = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await incidentsService.listIncidents({
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        page,
        pageSize: 15,
      });
      setIncidents(res.items);
      setTotalIncidents(res.total);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to load laboratory incidents.');
    } finally {
      setIsLoading(false);
    }
  }, [severityFilter, statusFilter, searchQuery, page]);

  // Fetch detail dossier
  const loadIncidentDetail = useCallback(async (id: number) => {
    setIsDetailLoading(true);
    try {
      const detail = await incidentsService.getIncident(id);
      setSelectedDetail(detail);
      setCapaForm({
        status: detail.status,
        resolution_notes: detail.resolution_notes || '',
      });
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to load incident dossier.');
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  // Fetch Blast Radius Impact
  const loadBlastRadius = useCallback(async (id: number) => {
    setIsBlastLoading(true);
    try {
      const impact = await incidentsService.getDownstreamImpact(id);
      setBlastRadiusData(impact);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to calculate blast radius impact.');
    } finally {
      setIsBlastLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  useEffect(() => {
    if (selectedIncidentId) {
      loadIncidentDetail(selectedIncidentId);
    } else {
      setSelectedDetail(null);
    }
  }, [selectedIncidentId, loadIncidentDetail]);

  useEffect(() => {
    if (blastRadiusIncidentId) {
      loadBlastRadius(blastRadiusIncidentId);
    } else {
      setBlastRadiusData(null);
    }
  }, [blastRadiusIncidentId, loadBlastRadius]);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIncidentForm.incident_code.trim() || !newIncidentForm.description.trim()) {
      setErrorMessage('Incident code and description are required.');
      return;
    }

    try {
      const res = await incidentsService.createIncident({
        ...newIncidentForm,
        sample_id: newIncidentForm.sample_id ? Number(newIncidentForm.sample_id) : undefined,
        storage_location_id: newIncidentForm.storage_location_id
          ? Number(newIncidentForm.storage_location_id)
          : undefined,
        occurred_at: new Date(newIncidentForm.occurred_at).toISOString(),
      });
      setSuccessMessage(`Incident ${res.incident_code} logged successfully.`);
      setIsNewIncidentModalOpen(false);
      setNewIncidentForm({
        incident_code: '',
        sample_id: undefined,
        storage_location_id: undefined,
        incident_type: 'contamination',
        severity: 'critical',
        description: '',
        occurred_at: new Date().toISOString().slice(0, 16),
        quarantine_descendants: true,
      });
      loadIncidents();
      setSelectedIncidentId(res.incident_id);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to record incident.');
    }
  };

  const handleUpdateCapa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentId) return;

    try {
      const updated = await incidentsService.updateIncident(selectedIncidentId, capaForm);
      setSelectedDetail(updated);
      setSuccessMessage('Investigation and CAPA resolution notes updated.');
      setIsCapaModalOpen(false);
      loadIncidents();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to update investigation.');
    }
  };

  const generateIncidentCode = () => {
    const year = new Date().getFullYear();
    const code = `INC-${year}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    setNewIncidentForm((prev) => ({ ...prev, incident_code: code }));
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return <span className="badge badge-danger">CRITICAL</span>;
      case 'high':
        return <span className="badge badge-sand">HIGH</span>;
      case 'medium':
        return <span className="badge badge-neutral">MEDIUM</span>;
      case 'low':
      default:
        return <span className="badge badge-teal">LOW</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'closed':
        return <span className="badge badge-success">Closed</span>;
      case 'mitigated':
        return <span className="badge badge-teal">Mitigated</span>;
      case 'investigating':
        return <span className="badge badge-sand">Investigating</span>;
      case 'open':
      default:
        return <span className="badge badge-danger">Open</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <IncidentDesk />
      {/* Toast Feedback */}
      {successMessage && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: 'var(--color-pale-teal)',
            border: '1px solid var(--color-teal)',
            borderRadius: 'var(--radius-control)',
            color: 'var(--color-teal)',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-teal)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#FDF2F2',
            border: '1px solid #F87171',
            borderRadius: 'var(--radius-control)',
            color: '#B91C1C',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Action Toolbar */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
              Incidents
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              Total incidents logged: {totalIncidents} | Automated quarantine enabled
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button disabled={!canReport}
            type="button"
            onClick={() => {
              generateIncidentCode();
              setIsNewIncidentModalOpen(true);
            }}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Plus size={16} />
            Log Incident
          </button>
          <button
            type="button"
            onClick={loadIncidents}
            className="btn btn-secondary"
            title="Refresh Incidents"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Grid: Incidents Table & Dossier Drawer */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedIncidentId ? '1fr 440px' : '1fr', gap: '24px' }}>
        {/* Incidents Table */}
        <div className="card" style={{ padding: '20px' }}>
          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '18px',
            }}
          >
            <div style={{ position: 'relative', width: '280px' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Search code, description, sample..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="input font-mono"
                style={{ paddingLeft: '36px', fontSize: '13px', width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={15} style={{ color: 'var(--color-muted)' }} />
                <select
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value);
                    setPage(1);
                  }}
                  className="input"
                  style={{ fontSize: '13px', minWidth: '130px' }}
                >
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="input"
                style={{ fontSize: '13px', minWidth: '130px' }}
              >
                <option value="">All Statuses</option>
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="mitigated">Mitigated</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <CompactTable label="incidents" extra={[5, 6, 7]} help={<DatabaseConcept topic="incident" />}>
              <table className="table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Incident Type</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Affected Specimen</th>
                  <th>Location</th>
                  <th>Occurred</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                      Loading laboratory incidents...
                    </td>
                  </tr>
                ) : incidents.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                      No laboratory incidents matching current criteria.
                    </td>
                  </tr>
                ) : (
                  incidents.map((inc) => (
                    <tr
                      key={inc.incident_id}
                      style={{
                        backgroundColor:
                          selectedIncidentId === inc.incident_id ? 'var(--color-pale-teal)' : undefined,
                      }}
                    >
                      <td className="font-mono" style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                        {inc.incident_code}
                      </td>
                      <td>
                        <span className="badge badge-neutral font-mono">{inc.incident_type}</span>
                      </td>
                      <td>{getSeverityBadge(inc.severity)}</td>
                      <td>{getStatusBadge(inc.status)}</td>
                      <td>
                        {inc.sample_code ? (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="font-mono" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
                              {inc.sample_code}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                              {inc.sample_name || ''}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>Facility Wide</span>
                        )}
                      </td>
                      <td className="font-mono" style={{ color: 'var(--color-muted)', fontSize: '12px' }}>
                        {inc.storage_location_code || '—'}
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '12px' }}>
                        {new Date(inc.occurred_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setBlastRadiusIncidentId(inc.incident_id)}
                            className="btn btn-secondary"
                            title="Trace Downstream Blast Radius"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              color: '#B91C1C',
                              borderColor: '#F87171',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Flame size={12} /> Blast Radius
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedIncidentId(inc.incident_id)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            Dossier
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </CompactTable>
          </div>

          {/* Pagination */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid var(--color-border)',
              fontSize: '12px',
              color: 'var(--color-muted)',
            }}
          >
            <div>
              Showing {incidents.length} of {totalIncidents} incidents
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={incidents.length < 15}
                onClick={() => setPage((p) => p + 1)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Selected Incident Dossier Drawer */}
        {selectedIncidentId && (
          <div
            className="card"
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: 'calc(100vh - 160px)',
              overflowY: 'auto',
            }}
          >
            {isDetailLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                Loading incident dossier...
              </div>
            ) : selectedDetail ? (
              <>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span className="font-mono" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)' }}>
                        {selectedDetail.incident_code}
                      </span>
                      {getSeverityBadge(selectedDetail.severity)}
                      {getStatusBadge(selectedDetail.status)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                      Type: <strong>{selectedDetail.incident_type}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedIncidentId(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Primary Affected Specimen Banner */}
                {selectedDetail.sample_code ? (
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor:
                        selectedDetail.sample_status === 'QUARANTINED' ? '#FDF2F2' : 'var(--color-pale-teal)',
                      border: `1px solid ${
                        selectedDetail.sample_status === 'QUARANTINED' ? '#F87171' : 'var(--color-teal)'
                      }`,
                      borderRadius: 'var(--radius-control)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>Primary Specimen:</span>
                      <span
                        className={`badge ${
                          selectedDetail.sample_status === 'QUARANTINED' ? 'badge-danger' : 'badge-neutral'
                        } font-mono`}
                      >
                        {selectedDetail.sample_status || 'UNKNOWN'}
                      </span>
                    </div>
                    <div className="font-mono" style={{ fontWeight: 700, color: 'var(--color-teal)' }}>
                      {selectedDetail.sample_code}
                    </div>
                    <div style={{ color: 'var(--color-muted)' }}>{selectedDetail.sample_name}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                    Facility-wide incident without single primary specimen.
                  </div>
                )}

                {/* Description */}
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Incident Circumstances
                  </label>
                  <p style={{ fontSize: '13px', color: 'var(--color-ink)', lineHeight: 1.5, margin: '4px 0 0' }}>
                    {selectedDetail.description}
                  </p>
                </div>

                {/* Timeline & Metadata */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    fontSize: '12px',
                    padding: '10px',
                    backgroundColor: 'var(--color-background)',
                    borderRadius: '6px',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--color-muted)' }}>Occurred:</span>
                    <div>{new Date(selectedDetail.occurred_at).toLocaleString()}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-muted)' }}>Reported By:</span>
                    <div style={{ fontWeight: 500 }}>{selectedDetail.reported_by_name || 'System'}</div>
                  </div>
                </div>

                {/* CAPA Notes */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      CAPA Resolution Notes
                    </label>
                  </div>
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      minHeight: '60px',
                    }}
                  >
                    {selectedDetail.resolution_notes || (
                      <span style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>
                        No corrective and preventive action notes logged yet.
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button disabled={!canWrite}
                    type="button"
                    onClick={() => setIsCapaModalOpen(true)}
                    className="btn btn-primary"
                    style={{ flex: 1, fontSize: '12px' }}
                  >
                    Update Investigation & CAPA
                  </button>
                  {selectedDetail.sample_id && (
                    <button
                      type="button"
                      onClick={() => setBlastRadiusIncidentId(selectedDetail.incident_id)}
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', color: '#B91C1C', borderColor: '#F87171' }}
                    >
                      <Flame size={14} /> Blast Radius
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Signature Modal / Panel: Trace Downstream Impact Blast Radius */}
      {blastRadiusIncidentId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(23, 43, 58, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '880px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              backgroundColor: '#FFFFFF',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Blast Radius Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '20px',
                paddingBottom: '16px',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <div
                    style={{
                      padding: '6px',
                      borderRadius: '6px',
                      backgroundColor: '#FDF2F2',
                      color: '#B91C1C',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ShieldAlert size={20} />
                  </div>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                    Downstream Blast Radius Analysis
                  </h3>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
                  Tracing recursive lineage DAG contamination from incident{' '}
                  <strong className="font-mono">{blastRadiusData?.incident_code}</strong> (Root Specimen:{' '}
                  <span className="font-mono font-bold text-teal">{blastRadiusData?.root_sample_code || 'None'}</span>)
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlastRadiusIncidentId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {isBlastLoading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-muted)' }}>
                <Clock size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <div>Computing recursive lineage graph blast radius...</div>
              </div>
            ) : blastRadiusData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                {/* 4 Hero KPI Banners */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '14px',
                  }}
                >
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: blastRadiusData.total_samples_at_risk > 0 ? '#FDF2F2' : 'var(--color-background)',
                      border: `1px solid ${blastRadiusData.total_samples_at_risk > 0 ? '#F87171' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-control)',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Downstream Specimens
                    </div>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: blastRadiusData.total_samples_at_risk > 0 ? '#B91C1C' : 'var(--color-ink)',
                      }}
                    >
                      {blastRadiusData.total_samples_at_risk}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Derived aliquots & extracts</div>
                  </div>

                  <div
                    style={{
                      padding: '14px',
                      backgroundColor:
                        blastRadiusData.total_experiments_compromised > 0 ? '#FFFBEB' : 'var(--color-background)',
                      border: `1px solid ${
                        blastRadiusData.total_experiments_compromised > 0 ? '#FCD34D' : 'var(--color-border)'
                      }`,
                      borderRadius: 'var(--radius-control)',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Compromised Projects
                    </div>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: blastRadiusData.total_experiments_compromised > 0 ? '#D97706' : 'var(--color-ink)',
                      }}
                    >
                      {blastRadiusData.total_experiments_compromised}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Active research cohorts</div>
                  </div>

                  <div
                    style={{
                      padding: '14px',
                      backgroundColor:
                        blastRadiusData.total_results_tainted > 0 ? '#FDF2F2' : 'var(--color-background)',
                      border: `1px solid ${blastRadiusData.total_results_tainted > 0 ? '#F87171' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-control)',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Tainted Results
                    </div>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: blastRadiusData.total_results_tainted > 0 ? '#B91C1C' : 'var(--color-ink)',
                      }}
                    >
                      {blastRadiusData.total_results_tainted}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Determinations at risk</div>
                  </div>

                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: 'var(--color-pale-teal)',
                      border: '1px solid rgba(40, 125, 120, 0.25)',
                      borderRadius: 'var(--radius-control)',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Max Lineage Depth
                    </div>
                    <div className="font-mono" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-teal)' }}>
                      {blastRadiusData.max_generation_depth} Generations
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Recursive propagation hops</div>
                  </div>
                </div>

                {/* Section 1: Downstream Samples Tree */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
                    <Layers size={16} color="var(--color-teal)" />
                    <span>Downstream Derived Child Specimens ({blastRadiusData.downstream_samples.length})</span>
                  </div>

                  {blastRadiusData.downstream_samples.length === 0 ? (
                    <div style={{ padding: '16px', backgroundColor: 'var(--color-background)', borderRadius: '6px', fontSize: '13px', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                      No downstream derived samples recorded for this specimen in the lineage DAG.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                      <CompactTable label="affected specimens" extra={[4, 6]}>
                        <table className="table" style={{ width: '100%', fontSize: '12px' }}>
                        <thead>
                          <tr>
                            <th>Generation</th>
                            <th>Sample Code</th>
                            <th>Specimen Name</th>
                            <th>Transformation</th>
                            <th>Status</th>
                            <th>Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blastRadiusData.downstream_samples.map((s) => (
                            <tr key={s.sample_id}>
                              <td>
                                <span className="badge badge-sand font-mono" style={{ fontSize: '11px' }}>
                                  Gen +{s.generation_distance}
                                </span>
                              </td>
                              <td className="font-mono" style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                                {s.sample_code}
                              </td>
                              <td style={{ fontWeight: 500 }}>{s.sample_name}</td>
                              <td>{s.transformation_type}</td>
                              <td>
                                <span
                                  className={`badge ${
                                    s.current_status === 'QUARANTINED' ? 'badge-danger' : 'badge-neutral'
                                  }`}
                                >
                                  {s.current_status}
                                </span>
                              </td>
                              <td className="font-mono" style={{ color: 'var(--color-muted)' }}>
                                {s.storage_location_code || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </CompactTable>
                    </div>
                  )}
                </div>

                {/* Section 2: Compromised Experiments */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
                    <TestTubes size={16} color="var(--color-teal)" />
                    <span>Compromised Research Experiments ({blastRadiusData.affected_experiments.length})</span>
                  </div>

                  {blastRadiusData.affected_experiments.length === 0 ? (
                    <div style={{ padding: '16px', backgroundColor: 'var(--color-background)', borderRadius: '6px', fontSize: '13px', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                      No research experiments are currently utilizing this specimen cohort.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                      <CompactTable label="affected experiments" extra={[3]}>
                        <table className="table" style={{ width: '100%', fontSize: '12px' }}>
                        <thead>
                          <tr>
                            <th>Experiment Code</th>
                            <th>Project Name</th>
                            <th>Workflow Status</th>
                            <th>Cohort Role</th>
                            <th>Compromised Sample</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blastRadiusData.affected_experiments.map((exp, idx) => (
                            <tr key={idx}>
                              <td className="font-mono" style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                                {exp.experiment_code}
                              </td>
                              <td style={{ fontWeight: 500 }}>{exp.experiment_name}</td>
                              <td>
                                <span className="badge badge-neutral">{exp.status}</span>
                              </td>
                              <td>{exp.usage_role}</td>
                              <td className="font-mono">{exp.associated_sample_code}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </CompactTable>
                    </div>
                  )}
                </div>

                {/* Section 3: Tainted Results */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
                    <FileText size={16} color="var(--color-teal)" />
                    <span>Tainted Experimental Results ({blastRadiusData.affected_results.length})</span>
                  </div>

                  {blastRadiusData.affected_results.length === 0 ? (
                    <div style={{ padding: '16px', backgroundColor: 'var(--color-background)', borderRadius: '6px', fontSize: '13px', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                      No analytical results recorded from compromised experiments yet.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                      <CompactTable label="affected results" extra={[4, 5]}>
                        <table className="table" style={{ width: '100%', fontSize: '12px' }}>
                        <thead>
                          <tr>
                            <th>Result Code</th>
                            <th>Result Title</th>
                            <th>Experiment</th>
                            <th>Value</th>
                            <th>Interpretation</th>
                            <th>State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blastRadiusData.affected_results.map((res) => (
                            <tr key={res.experiment_result_id}>
                              <td className="font-mono" style={{ fontWeight: 600, color: '#B91C1C' }}>
                                {res.result_code}
                              </td>
                              <td style={{ fontWeight: 500 }}>{res.result_title}</td>
                              <td className="font-mono">{res.experiment_code}</td>
                              <td className="font-mono">
                                {res.result_value !== undefined ? `${res.result_value} ${res.result_unit || ''}` : '—'}
                              </td>
                              <td>
                                <span className="badge badge-sand">{res.interpretation || 'RECORDED'}</span>
                              </td>
                              <td>
                                {res.is_final ? (
                                  <span className="badge badge-danger">LOCKED ASSET</span>
                                ) : (
                                  <span className="badge badge-neutral">Draft</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </CompactTable>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal: Log Incident */}
      {isNewIncidentModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(23, 43, 58, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '540px',
              padding: '24px',
              backgroundColor: '#FFFFFF',
              boxShadow: 'var(--shadow-lg)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#B91C1C" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                  Log Laboratory Incident
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewIncidentModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Incident Code *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    required
                    value={newIncidentForm.incident_code}
                    onChange={(e) => setNewIncidentForm({ ...newIncidentForm, incident_code: e.target.value })}
                    className="input font-mono"
                    placeholder="INC-2026-XXXX"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={generateIncidentCode}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px' }}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Incident Type *
                  </label>
                  <select
                    value={newIncidentForm.incident_type}
                    onChange={(e) => setNewIncidentForm({ ...newIncidentForm, incident_type: e.target.value })}
                    className="input"
                  >
                    <option value="contamination">Biological Contamination</option>
                    <option value="temperature_excursion">Temperature Excursion</option>
                    <option value="missing_sample">Missing / Lost Specimen</option>
                    <option value="handling_issue">Physical Handling Breach</option>
                    <option value="equipment_failure">Equipment / Freezing Failure</option>
                    <option value="other">Other Laboratory Anomaly</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Severity Level *
                  </label>
                  <select
                    value={newIncidentForm.severity}
                    onChange={(e) => setNewIncidentForm({ ...newIncidentForm, severity: e.target.value })}
                    className="input"
                  >
                    <option value="critical">CRITICAL (Auto-Quarantine)</option>
                    <option value="high">HIGH (Auto-Quarantine)</option>
                    <option value="medium">MEDIUM</option>
                    <option value="low">LOW</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Affected Specimen ID
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newIncidentForm.sample_id || ''}
                    onChange={(e) =>
                      setNewIncidentForm({
                        ...newIncidentForm,
                        sample_id: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="input font-mono"
                    placeholder="e.g. 1 (Specimen ID)"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Storage Unit ID
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newIncidentForm.storage_location_id || ''}
                    onChange={(e) =>
                      setNewIncidentForm({
                        ...newIncidentForm,
                        storage_location_id: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="input font-mono"
                    placeholder="e.g. 1 (Freezer/Box)"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Factual Circumstances & Breach Description *
                </label>
                <textarea
                  required
                  rows={3}
                  value={newIncidentForm.description}
                  onChange={(e) => setNewIncidentForm({ ...newIncidentForm, description: e.target.value })}
                  className="input"
                  placeholder="Detail observations, breach mechanisms, and immediately observed effects..."
                />
              </div>

              {/* Cascade Quarantine Checkbox */}
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#FDF2F2',
                  border: '1px solid #F87171',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <input
                  type="checkbox"
                  id="cascade_quarantine"
                  checked={newIncidentForm.quarantine_descendants}
                  onChange={(e) =>
                    setNewIncidentForm({ ...newIncidentForm, quarantine_descendants: e.target.checked })
                  }
                  style={{ width: '16px', height: '16px', accentColor: '#B91C1C' }}
                />
                <label htmlFor="cascade_quarantine" style={{ fontSize: '12px', color: '#B91C1C', cursor: 'pointer', fontWeight: 500 }}>
                  <strong>Recursive Cascade:</strong> Automatically QUARANTINE all downstream child specimens derived via the lineage DAG.
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewIncidentModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  Log Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Update Investigation & CAPA */}
      {isCapaModalOpen && selectedDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(23, 43, 58, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '500px',
              padding: '24px',
              backgroundColor: '#FFFFFF',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                Investigation & CAPA: {selectedDetail.incident_code}
              </h3>
              <button
                type="button"
                onClick={() => setIsCapaModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateCapa} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Investigation Status
                </label>
                <select
                  value={capaForm.status}
                  onChange={(e) => setCapaForm({ ...capaForm, status: e.target.value })}
                  className="input"
                >
                  <option value="open">Open (Active Hazard)</option>
                  <option value="investigating">Under Investigation</option>
                  <option value="mitigated">Mitigated (Containment Active)</option>
                  <option value="closed">Closed & Resolved</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Corrective & Preventive Action (CAPA) Notes *
                </label>
                <textarea
                  required
                  rows={4}
                  value={capaForm.resolution_notes || ''}
                  onChange={(e) => setCapaForm({ ...capaForm, resolution_notes: e.target.value })}
                  className="input"
                  placeholder="Detail containment steps, root causes identified, and preventive decontamination procedures performed..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCapaModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  Save Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
