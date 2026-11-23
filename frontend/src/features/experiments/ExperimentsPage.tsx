import { DatabaseConcept } from '../../components/DatabaseConcept';
import { CompactTable } from '../../components/CompactTable';
import { useAuth } from '../auth/AuthContext';
import React, { useState, useEffect, useCallback } from 'react';
import {
  TestTubes,
  FileText,
  Search,
  Plus,
  RefreshCw,
  X,
  CheckCircle2,
  Lock,
  Layers,
  Wrench,
  ChevronRight,
  Filter,
  Edit2,
  Trash2,
} from 'lucide-react';
import { storageService } from '../storage/storageService';
import { Equipment } from '../storage/types';
import { apiRequest } from '../../common/apiClient';
import { experimentsService } from './experimentsService';
import {
  ExperimentListItem,
  ExperimentDetail,
  ResultDetail,
  ExperimentCreatePayload,
  ResultCreatePayload,
  ResultVerifyPayload,
  ResultUpdatePayload,
} from './types';

interface ExperimentsPageProps {
  initialSearch?: string;
  initialTab?: 'experiments' | 'results';
}

export const ExperimentsPage: React.FC<ExperimentsPageProps> = ({ initialTab = 'experiments', initialSearch = '' }) => {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const canVerify = canWrite || user?.role === 'REVIEWER';
  const [activeTab, setActiveTab] = useState<'experiments' | 'results'>(initialTab);

  // Experiments List State
  const [experiments, setExperiments] = useState<ExperimentListItem[]>([]);
  const [totalExperiments, setTotalExperiments] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selected Experiment Workspace State
  const [selectedExpId, setSelectedExpId] = useState<number | null>(null);
  const [selectedExpDetail, setSelectedExpDetail] = useState<ExperimentDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Global Results State
  const [results, setResults] = useState<ResultDetail[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [resultsPage, setResultsPage] = useState(1);
  const [isResultsLoading, setIsResultsLoading] = useState(false);

  // Modals State
  const [isNewExpModalOpen, setIsNewExpModalOpen] = useState(false);
  const [isAttachSampleModalOpen, setIsAttachSampleModalOpen] = useState(false);
  const [isNewResultModalOpen, setIsNewResultModalOpen] = useState(false);
  const [isVerifyResultModalOpen, setIsVerifyResultModalOpen] = useState(false);
  const [activeResultToVerify, setActiveResultToVerify] = useState<ResultDetail | null>(null);

  // Edit Experiment Modal State
  const [isEditExpModalOpen, setIsEditExpModalOpen] = useState(false);
  const [editExpForm, setEditExpForm] = useState<ExperimentCreatePayload>({
    experiment_code: '',
    experiment_name: '',
    objective: '',
    protocol_reference: '',
    status: 'planned',
  });

  // Allocate Equipment Modal State
  const [isAllocateEquipmentModalOpen, setIsAllocateEquipmentModalOpen] = useState(false);
  const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([]);
  const [allocateEquipmentForm, setAllocateEquipmentForm] = useState({
    equipment_id: 0,
    usage_notes: '',
  });

  // Edit Result Modal State
  const [isEditResultModalOpen, setIsEditResultModalOpen] = useState(false);
  const [activeResultToEdit, setActiveResultToEdit] = useState<ResultDetail | null>(null);
  const [editResultForm, setEditResultForm] = useState<ResultUpdatePayload>({
    result_title: '',
    result_value: 0,
    result_unit: '',
    interpretation: 'OPTIMAL',
    observation: '',
    is_final: false,
  });

  // Form states
  const [newExpForm, setNewExpForm] = useState<ExperimentCreatePayload>({
    experiment_code: '',
    experiment_name: '',
    objective: '',
    protocol_reference: '',
    status: 'planned',
  });

  const [attachSampleForm, setAttachSampleForm] = useState({
    sample_identifier: '1',
    usage_role: 'input',
    quantity_used: 10,
    quantity_unit: 'µL',
    notes: '',
  });

  const [newResultForm, setNewResultForm] = useState<ResultCreatePayload>({
    result_code: '',
    result_title: '',
    observation: '',
    result_value: 0,
    result_unit: '%',
    interpretation: 'OPTIMAL',
    is_final: false,
  });

  const [verifyForm, setVerifyForm] = useState<ResultVerifyPayload>({
    is_final: true,
    verification_notes: '',
  });

  // Fetch experiments
  const loadExperiments = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await experimentsService.listExperiments({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        page,
        pageSize: 15,
      });
      setExperiments(res.items);
      setTotalExperiments(res.total);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to load experiments.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery, page]);

  // Fetch results
  const loadResults = useCallback(async () => {
    setIsResultsLoading(true);
    try {
      const res = await experimentsService.listResults({
        page: resultsPage,
        pageSize: 15,
      });
      setResults(res.items);
      setTotalResults(res.total);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to load scientific results.');
    } finally {
      setIsResultsLoading(false);
    }
  }, [resultsPage]);

  // Fetch selected experiment detail
  const loadExperimentDetail = useCallback(async (id: number) => {
    setIsDetailLoading(true);
    try {
      const detail = await experimentsService.getExperimentDetail(id);
      setSelectedExpDetail(detail);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to load experiment details.');
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'experiments') {
      loadExperiments();
    } else {
      loadResults();
    }
  }, [activeTab, loadExperiments, loadResults]);

  useEffect(() => {
    if (selectedExpId) {
      loadExperimentDetail(selectedExpId);
    } else {
      setSelectedExpDetail(null);
    }
  }, [selectedExpId, loadExperimentDetail]);

  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpForm.experiment_code.trim() || !newExpForm.experiment_name.trim()) {
      setErrorMessage('Experiment code and name are required.');
      return;
    }

    try {
      const created = await experimentsService.createExperiment(newExpForm);
      setSuccessMessage(`Experiment ${created.experiment_code} created successfully.`);
      setIsNewExpModalOpen(false);
      setNewExpForm({
        experiment_code: '',
        experiment_name: '',
        objective: '',
        protocol_reference: '',
        status: 'planned',
      });
      loadExperiments();
      setSelectedExpId(created.experiment_id);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to create experiment.');
    }
  };

  const handleOpenEditExp = () => {
    if (!selectedExpDetail) return;
    setEditExpForm({
      experiment_code: selectedExpDetail.experiment_code,
      experiment_name: selectedExpDetail.experiment_name,
      objective: selectedExpDetail.objective || '',
      protocol_reference: selectedExpDetail.protocol_reference || '',
      status: selectedExpDetail.status || 'planned',
    });
    setIsEditExpModalOpen(true);
  };

  const handleUpdateExp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpId || !editExpForm.experiment_name.trim()) {
      setErrorMessage('Experiment name is required.');
      return;
    }

    try {
      const updated = await experimentsService.updateExperiment(selectedExpId, {
        experiment_name: editExpForm.experiment_name,
        objective: editExpForm.objective,
        protocol_reference: editExpForm.protocol_reference,
        status: editExpForm.status,
      });
      setSelectedExpDetail(updated);
      setSuccessMessage(`Experiment '${updated.experiment_code}' updated successfully.`);
      setIsEditExpModalOpen(false);
      loadExperiments();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to update experiment.');
    }
  };

  const handleAttachSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpId) return;

    try {
      let resolvedSampleId: number;
      const rawInput = attachSampleForm.sample_identifier.trim();

      // Check if user entered a direct numeric ID
      if (/^\d+$/.test(rawInput)) {
        resolvedSampleId = Number(rawInput);
      } else {
        // Look up specimen by sample_code (e.g. S001, DEMO-ROOT)
        const searchRes = await apiRequest<{ items: Array<{ sample_id: number; sample_code: string }> }>(
          `/samples?search=${encodeURIComponent(rawInput)}&page_size=10`
        );
        const match = searchRes.items.find(
          (s: { sample_id: number; sample_code: string }) => s.sample_code.toUpperCase() === rawInput.toUpperCase()
        ) || searchRes.items[0];

        if (!match) {
          throw new Error(`Specimen '${rawInput}' not found in biobank inventory.`);
        }
        resolvedSampleId = match.sample_id;
      }

      await experimentsService.attachSample(selectedExpId, {
        sample_id: resolvedSampleId,
        usage_role: attachSampleForm.usage_role,
        quantity_used: Number(attachSampleForm.quantity_used),
        quantity_unit: attachSampleForm.quantity_unit,
        notes: attachSampleForm.notes,
      });
      setSuccessMessage('Specimen attached to cohort successfully.');
      setIsAttachSampleModalOpen(false);
      loadExperimentDetail(selectedExpId);
      loadExperiments();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to attach specimen.');
    }
  };

  const handleCreateResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpId || !newResultForm.result_code.trim() || !newResultForm.result_title.trim()) {
      setErrorMessage('Result code and title are required.');
      return;
    }

    try {
      await experimentsService.createResult(selectedExpId, newResultForm);
      setSuccessMessage('Scientific result recorded successfully.');
      setIsNewResultModalOpen(false);
      setNewResultForm({
        result_code: '',
        result_title: '',
        observation: '',
        result_value: 0,
        result_unit: '%',
        interpretation: 'OPTIMAL',
        is_final: false,
      });
      loadExperimentDetail(selectedExpId);
      loadExperiments();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to record result.');
    }
  };

  const handleVerifyResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeResultToVerify) return;

    try {
      await experimentsService.verifyResult(activeResultToVerify.experiment_result_id, verifyForm);
      setSuccessMessage(`Result ${activeResultToVerify.result_code} verified and scientifically locked.`);
      setIsVerifyResultModalOpen(false);
      setActiveResultToVerify(null);
      if (selectedExpId) {
        loadExperimentDetail(selectedExpId);
      }
      if (activeTab === 'results') {
        loadResults();
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to verify result.');
    }
  };

  const handleOpenAllocateEquipment = async () => {
    try {
      const eqList = await storageService.listEquipment();
      setAvailableEquipment(eqList);
      if (eqList.length > 0) {
        setAllocateEquipmentForm({
          equipment_id: eqList[0].equipment_id,
          usage_notes: '',
        });
      }
      setIsAllocateEquipmentModalOpen(true);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to load equipment catalog.');
    }
  };

  const handleAllocateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpId || !allocateEquipmentForm.equipment_id) {
      setErrorMessage('Please select an instrument to allocate.');
      return;
    }

    try {
      await experimentsService.attachEquipment(selectedExpId, {
        equipment_id: Number(allocateEquipmentForm.equipment_id),
        usage_notes: allocateEquipmentForm.usage_notes || undefined,
      });
      setSuccessMessage('Equipment successfully allocated to experiment.');
      setIsAllocateEquipmentModalOpen(false);
      loadExperimentDetail(selectedExpId);
      loadExperiments();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to allocate equipment.');
    }
  };

  const handleOpenEditResult = (r: ResultDetail) => {
    setActiveResultToEdit(r);
    setEditResultForm({
      result_title: r.result_title || '',
      result_value: r.result_value !== undefined ? r.result_value : 0,
      result_unit: r.result_unit || '',
      interpretation: r.interpretation || 'OPTIMAL',
      observation: r.observation || '',
      is_final: r.is_final || false,
    });
    setIsEditResultModalOpen(true);
  };

  const handleUpdateResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeResultToEdit) return;

    try {
      await experimentsService.updateResult(activeResultToEdit.experiment_result_id, editResultForm);
      setSuccessMessage(`Result '${activeResultToEdit.result_code}' updated successfully.`);
      setIsEditResultModalOpen(false);
      setActiveResultToEdit(null);
      if (selectedExpId) {
        loadExperimentDetail(selectedExpId);
      }
      if (activeTab === 'results') {
        loadResults();
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to update result.');
    }
  };

  const handleDeleteExperiment = async (expId: number, expCode: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete Experiment ${expCode}? This will also delete linked cohort assignments and results.`)) {
      return;
    }
    try {
      await experimentsService.deleteExperiment(expId);
      setSuccessMessage(`Experiment ${expCode} deleted successfully.`);
      if (selectedExpId === expId) {
        setSelectedExpId(null);
        setSelectedExpDetail(null);
      }
      loadExperiments();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to delete experiment.');
    }
  };

  const handleDeleteResult = async (resultId: number, resultCode: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete Result ${resultCode}?`)) {
      return;
    }
    try {
      await experimentsService.deleteResult(resultId);
      setSuccessMessage(`Result ${resultCode} deleted successfully.`);
      if (selectedExpId) {
        loadExperimentDetail(selectedExpId);
      }
      if (activeTab === 'results') {
        loadResults();
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to delete result.');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedExpDetail) return;
    try {
      const updated = await experimentsService.updateExperiment(selectedExpDetail.experiment_id, {
        status: newStatus,
      });
      setSelectedExpDetail(updated);
      setSuccessMessage(`Experiment status updated to ${newStatus}.`);
      loadExperiments();
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || 'Failed to update experiment status.');
    }
  };

  const generateExpCode = () => {
    const code = `EXP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setNewExpForm((prev) => ({ ...prev, experiment_code: code }));
  };

  const generateResultCode = () => {
    const code = `RES-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setNewResultForm((prev) => ({ ...prev, result_code: code }));
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return <span className="badge badge-success">Active</span>;
      case 'completed':
        return <span className="badge badge-teal">Completed</span>;
      case 'cancelled':
        return <span className="badge badge-danger">Cancelled</span>;
      case 'planned':
      default:
        return <span className="badge badge-neutral">Planned</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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

      {/* Tab Navigation & Primary Action Bar */}
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('experiments');
              setSelectedExpId(null);
            }}
            className={`btn ${activeTab === 'experiments' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
          >
            <TestTubes size={16} />
            Research Projects ({totalExperiments})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('results');
              setSelectedExpId(null);
            }}
            className={`btn ${activeTab === 'results' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
          >
            <FileText size={16} />
            Scientific Results ({totalResults})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeTab === 'experiments' && (
            <button disabled={!canWrite}
              type="button"
              onClick={() => {
                generateExpCode();
                setIsNewExpModalOpen(true);
              }}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <Plus size={16} />
              New Research Project
            </button>
          )}
          <button
            type="button"
            onClick={() => (activeTab === 'experiments' ? loadExperiments() : loadResults())}
            className="btn btn-secondary"
            title="Refresh Registry"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={15} className={isLoading || isResultsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'experiments' ? (
        <div style={{ display: 'grid', gridTemplateColumns: selectedExpId ? '1fr 440px' : '1fr', gap: '24px' }}>
          {/* Experiments Table & Filters */}
          <div className="card" style={{ padding: '20px' }}>
            {/* Filter Toolbar */}
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
                  placeholder="Search code, name, protocol..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="input font-mono"
                  style={{ paddingLeft: '36px', fontSize: '13px', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={15} style={{ color: 'var(--color-muted)' }} />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="input"
                  style={{ fontSize: '13px', minWidth: '140px' }}
                >
                  <option value="">All Statuses</option>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <CompactTable label="experiments" extra={[3, 5, 6, 7, 8]} showLens={false} help={<DatabaseConcept topic="experiment" />}>
                <table className="table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Project Name</th>
                    <th>Protocol</th>
                    <th>Status</th>
                    <th>Cohort</th>
                    <th>Instruments</th>
                    <th>Results</th>
                    <th>Lead</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                        Loading research experiments...
                      </td>
                    </tr>
                  ) : experiments.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                        No research experiments found matching current criteria.
                      </td>
                    </tr>
                  ) : (
                    experiments.map((exp) => (
                      <tr
                        key={exp.experiment_id}
                        style={{
                          backgroundColor:
                            selectedExpId === exp.experiment_id ? 'var(--color-pale-teal)' : undefined,
                        }}
                      >
                        <td className="font-mono" style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                          {exp.experiment_code}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{exp.experiment_name}</div>
                          {exp.objective && (
                            <div
                              title={exp.objective}
                              style={{
                                fontSize: '11px',
                                color: 'var(--color-muted)',
                                maxWidth: '280px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                marginTop: '2px',
                              }}
                            >
                              🎯 {exp.objective}
                            </div>
                          )}
                        </td>
                        <td style={{ color: 'var(--color-muted)', fontSize: '12px' }}>
                          {exp.protocol_reference || '—'}
                        </td>
                        <td>{getStatusBadge(exp.status)}</td>
                        <td>
                          <span
                            className="badge badge-neutral font-mono"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Layers size={11} /> {exp.sample_count}
                          </span>
                        </td>
                        <td>
                          <span
                            className="badge badge-neutral font-mono"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Wrench size={11} /> {exp.equipment_count}
                          </span>
                        </td>
                        <td>
                          <span
                            className="badge badge-neutral font-mono"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <FileText size={11} /> {exp.result_count}
                          </span>
                        </td>
                        <td style={{ color: 'var(--color-muted)' }}>{exp.lead_researcher_name || 'Unassigned'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedExpId(exp.experiment_id)}
                              className="btn btn-secondary"
                              style={{
                                padding: '4px 10px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              Workspace <ChevronRight size={13} />
                            </button>
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => handleDeleteExperiment(exp.experiment_id, exp.experiment_code)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  borderRadius: '4px',
                                  border: '1px solid #FECACA',
                                  backgroundColor: '#FEF2F2',
                                  color: 'var(--color-danger)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Delete experiment"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
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
                Showing {experiments.length} of {totalExperiments} experiments
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
                  disabled={experiments.length < 15}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* Selected Experiment Workspace Drawer */}
          {selectedExpId && (
            <div
              className="card"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                maxHeight: 'calc(100vh - 160px)',
                overflowY: 'auto',
              }}
            >
              {isDetailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                  Loading experiment workspace...
                </div>
              ) : selectedExpDetail ? (
                <>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-teal)' }}>
                          {selectedExpDetail.experiment_code}
                        </span>
                        {getStatusBadge(selectedExpDetail.status)}
                      </div>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                        {selectedExpDetail.experiment_name}
                      </h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {canWrite && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={handleOpenEditExp}
                          title="Edit experiment details"
                        >
                          <Edit2 size={12} />
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedExpId(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Status Quick-Update & Metadata */}
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: 'var(--color-pale-teal)',
                      borderRadius: 'var(--radius-control)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>Workflow State:</span>
                      <select
                        value={selectedExpDetail.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--color-teal)',
                          backgroundColor: '#FFFFFF',
                          fontWeight: 600,
                        }}
                      >
                        <option value="planned">Planned</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    {selectedExpDetail.protocol_reference && (
                      <div>
                        <span style={{ color: 'var(--color-muted)' }}>Protocol: </span>
                        <strong className="font-mono">{selectedExpDetail.protocol_reference}</strong>
                      </div>
                    )}
                    {selectedExpDetail.objective && (
                      <div>
                        <span style={{ color: 'var(--color-muted)' }}>Objective: </span>
                        <span>{selectedExpDetail.objective}</span>
                      </div>
                    )}
                  </div>

                  {/* Section 1: Specimen Cohort */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                        <Layers size={14} color="var(--color-teal)" />
                        <span>Cohort Specimens ({selectedExpDetail.samples.length})</span>
                      </div>
                      <button disabled={!canWrite}
                        type="button"
                        onClick={() => setIsAttachSampleModalOpen(true)}
                        className="btn btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Plus size={12} /> Attach
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedExpDetail.samples.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                          No specimens attached to this cohort yet.
                        </div>
                      ) : (
                        selectedExpDetail.samples.map((s) => (
                          <div
                            key={s.sample_id}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--color-border)',
                              backgroundColor: '#FFFFFF',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '12px',
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="font-mono" style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                                  {s.sample_code}
                                </span>
                                <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '1px 5px' }}>
                                  {s.usage_role}
                                </span>
                              </div>
                              <div style={{ color: 'var(--color-ink)', fontWeight: 500 }}>{s.sample_name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span className="font-mono" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
                                {s.quantity_used ? `${s.quantity_used} ${s.quantity_unit || 'µL'}` : '—'}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Section 2: Laboratory Equipment */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                        <Wrench size={14} color="var(--color-teal)" />
                        <span>Allocated Equipment ({selectedExpDetail.equipment.length})</span>
                      </div>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={handleOpenAllocateEquipment}
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Plus size={12} /> Allocate
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {selectedExpDetail.equipment.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                          No specific instruments reserved.
                        </div>
                      ) : (
                        selectedExpDetail.equipment.map((eq) => (
                          <div
                            key={eq.experiment_equipment_id}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--color-background)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '12px',
                            }}
                          >
                            <span className="font-mono" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
                              {eq.equipment_code}
                            </span>
                            <span style={{ color: 'var(--color-muted)' }}>{eq.equipment_name}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Section 3: Generated Results */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                        <FileText size={14} color="var(--color-teal)" />
                        <span>Experimental Results ({selectedExpDetail.results.length})</span>
                      </div>
                      <button disabled={!canWrite}
                        type="button"
                        onClick={() => {
                          generateResultCode();
                          setIsNewResultModalOpen(true);
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Plus size={12} /> Record Result
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedExpDetail.results.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                          No scientific results logged yet for this experiment.
                        </div>
                      ) : (
                        selectedExpDetail.results.map((res) => (
                          <div
                            key={res.experiment_result_id}
                            style={{
                              padding: '10px',
                              borderRadius: '6px',
                              border: '1px solid var(--color-border)',
                              backgroundColor: res.is_final ? 'rgba(40, 125, 120, 0.04)' : '#FFFFFF',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              fontSize: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                                  {res.result_code}
                                </span>
                                {res.is_final ? (
                                  <span
                                    className="badge badge-success font-mono"
                                    style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                  >
                                    <Lock size={10} /> Verified
                                  </span>
                                ) : (
                                  <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                                    Draft
                                  </span>
                                )}
                              </div>
                              <span
                                className={`badge ${
                                  res.interpretation === 'OPTIMAL' || res.interpretation === 'PASS'
                                    ? 'badge-success'
                                    : 'badge-sand'
                                }`}
                                style={{ fontSize: '10px' }}
                              >
                                {res.interpretation || 'RECORDED'}
                              </span>
                            </div>

                            <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{res.result_title}</div>

                            {res.result_value !== undefined && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'baseline',
                                  gap: '6px',
                                  padding: '4px 8px',
                                  backgroundColor: 'var(--color-background)',
                                  borderRadius: '4px',
                                }}
                              >
                                <span style={{ color: 'var(--color-muted)', fontSize: '11px' }}>Metric:</span>
                                <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-teal)' }}>
                                  {res.result_value} {res.result_unit}
                                </span>
                              </div>
                            )}

                            {res.observation && (
                              <div style={{ color: 'var(--color-muted)', fontSize: '11px', lineHeight: 1.4 }}>
                                {res.observation}
                              </div>
                            )}

                            {!res.is_final && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                                <button disabled={!canVerify}
                                  type="button"
                                  onClick={() => {
                                    setActiveResultToVerify(res);
                                    setIsVerifyResultModalOpen(true);
                                  }}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: '3px 8px',
                                    fontSize: '11px',
                                    color: 'var(--color-teal)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <CheckCircle2 size={12} /> Verify & Lock
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        /* Global Scientific Results Registry Tab */
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '4px' }}>
              Scientific Results Registry
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
              Comprehensive log of analytical determinations across all experimental protocols with peer verification tracking.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <CompactTable label="results" extra={[2, 4, 5, 6]} showLens={false} help={<DatabaseConcept topic="results" />}>
              <table className="table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>Result Code</th>
                  <th>Experiment Code</th>
                  <th>Title & Observation</th>
                  <th>Metric Value</th>
                  <th>Interpretation</th>
                  <th>Recorded By</th>
                  <th>Verification</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isResultsLoading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                      Loading scientific results registry...
                    </td>
                  </tr>
                ) : results.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                      No scientific results registered yet.
                    </td>
                  </tr>
                ) : (
                  results.map((r) => (
                    <tr key={r.experiment_result_id}>
                      <td className="font-mono" style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                        {r.result_code}
                      </td>
                      <td className="font-mono" style={{ color: 'var(--color-ink)' }}>
                        {r.experiment_code}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--color-ink)' }}>{r.result_title}</div>
                        {r.observation && (
                          <div style={{ fontSize: '11px', color: 'var(--color-muted)', maxWidth: '300px' }}>
                            {r.observation}
                          </div>
                        )}
                      </td>
                      <td className="font-mono" style={{ fontWeight: 700 }}>
                        {r.result_value !== undefined ? `${r.result_value} ${r.result_unit || ''}` : '—'}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            r.interpretation === 'OPTIMAL' || r.interpretation === 'PASS'
                              ? 'badge-success'
                              : 'badge-neutral'
                          }`}
                        >
                          {r.interpretation || 'RECORDED'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-muted)' }}>{r.recorded_by_name || 'System'}</td>
                      <td>
                        {r.is_final ? (
                          <span
                            className="badge badge-success font-mono"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Lock size={11} /> Locked
                          </span>
                        ) : (
                          <span className="badge badge-neutral">Draft</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditResult(r)}
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              title="Edit result fields"
                            >
                              <Edit2 size={11} /> Edit
                            </button>
                          )}
                          {!r.is_final ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveResultToVerify(r);
                                setIsVerifyResultModalOpen(true);
                              }}
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                            >
                              Verify
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Verified</span>
                          )}
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => handleDeleteResult(r.experiment_result_id, r.result_code)}
                              style={{
                                padding: '3px 8px',
                                fontSize: '11px',
                                borderRadius: '4px',
                                border: '1px solid #FECACA',
                                backgroundColor: '#FEF2F2',
                                color: 'var(--color-danger)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Delete result"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </CompactTable>
          </div>

          {/* Results Pagination */}
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
              Showing {results.length} of {totalResults} results
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={resultsPage <= 1}
                onClick={() => setResultsPage((p) => p - 1)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={results.length < 15}
                onClick={() => setResultsPage((p) => p + 1)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Research Project */}
      {isNewExpModalOpen && (
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
              maxWidth: '520px',
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
                Create Research Project
              </h3>
              <button
                type="button"
                onClick={() => setIsNewExpModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateExperiment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Experiment Code *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    required
                    value={newExpForm.experiment_code}
                    onChange={(e) => setNewExpForm({ ...newExpForm, experiment_code: e.target.value })}
                    className="input font-mono"
                    placeholder="EXP-XXXXXX"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={generateExpCode}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px' }}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Project Name *
                </label>
                <input
                  type="text"
                  required
                  value={newExpForm.experiment_name}
                  onChange={(e) => setNewExpForm({ ...newExpForm, experiment_name: e.target.value })}
                  className="input"
                  placeholder="e.g. Deep Metagenomic Sequencing Cohort"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Protocol Reference
                </label>
                <input
                  type="text"
                  value={newExpForm.protocol_reference || ''}
                  onChange={(e) => setNewExpForm({ ...newExpForm, protocol_reference: e.target.value })}
                  className="input font-mono"
                  placeholder="e.g. PROTO-NGS-2026-V3"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Scientific Objective
                </label>
                <textarea
                  value={newExpForm.objective || ''}
                  onChange={(e) => setNewExpForm({ ...newExpForm, objective: e.target.value })}
                  className="input"
                  rows={3}
                  placeholder="Summarize the experimental aims and expected parameters..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewExpModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  Initialize Experiment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Attach Specimen */}
      {isAttachSampleModalOpen && (
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
              maxWidth: '460px',
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
                Attach Specimen to Cohort
              </h3>
              <DatabaseConcept topic="experiment" />
              <button
                type="button"
                onClick={() => setIsAttachSampleModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAttachSample} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Specimen ID or Code *
                </label>
                <input
                  type="text"
                  required
                  value={attachSampleForm.sample_identifier}
                  onChange={(e) => setAttachSampleForm({ ...attachSampleForm, sample_identifier: e.target.value })}
                  className="input font-mono"
                  placeholder="e.g. 1 or S001, DEMO-ROOT..."
                />
                <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                  Enter either numeric specimen ID (e.g. 1) or specimen code (e.g. S001, DEMO-ALQ-ARCH).
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Cohort Role *
                </label>
                <select
                  value={attachSampleForm.usage_role}
                  onChange={(e) => setAttachSampleForm({ ...attachSampleForm, usage_role: e.target.value })}
                  className="input"
                >
                  <option value="input">Input (Primary Analyte)</option>
                  <option value="control">Control (Baseline Standard)</option>
                  <option value="target">Target (Intervention Subject)</option>
                  <option value="blank">Blank (Reagent Verification)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Quantity Used
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={attachSampleForm.quantity_used}
                    onChange={(e) => setAttachSampleForm({ ...attachSampleForm, quantity_used: Number(e.target.value) })}
                    className="input font-mono"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Unit
                  </label>
                  <input
                    type="text"
                    value={attachSampleForm.quantity_unit}
                    onChange={(e) => setAttachSampleForm({ ...attachSampleForm, quantity_unit: e.target.value })}
                    className="input font-mono"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Cohort Notes
                </label>
                <input
                  type="text"
                  value={attachSampleForm.notes}
                  onChange={(e) => setAttachSampleForm({ ...attachSampleForm, notes: e.target.value })}
                  className="input"
                  placeholder="e.g. Triplicate run on channel B"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAttachSampleModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  Attach to Cohort
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Result */}
      {isNewResultModalOpen && (
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
              maxWidth: '480px',
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
                Record Scientific Result
              </h3>
              <button
                type="button"
                onClick={() => setIsNewResultModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateResult} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Result Code *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    required
                    value={newResultForm.result_code}
                    onChange={(e) => setNewResultForm({ ...newResultForm, result_code: e.target.value })}
                    className="input font-mono"
                    placeholder="RES-XXXXXX"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={generateResultCode}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px' }}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Result Title *
                </label>
                <input
                  type="text"
                  required
                  value={newResultForm.result_title}
                  onChange={(e) => setNewResultForm({ ...newResultForm, result_title: e.target.value })}
                  className="input"
                  placeholder="e.g. Mean Coverage Depth Assessment"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Metric Value
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newResultForm.result_value}
                    onChange={(e) => setNewResultForm({ ...newResultForm, result_value: Number(e.target.value) })}
                    className="input font-mono"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Unit
                  </label>
                  <input
                    type="text"
                    value={newResultForm.result_unit}
                    onChange={(e) => setNewResultForm({ ...newResultForm, result_unit: e.target.value })}
                    className="input font-mono"
                    placeholder="e.g. %, x, ng/uL"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Scientific Interpretation
                </label>
                <select
                  value={newResultForm.interpretation}
                  onChange={(e) => setNewResultForm({ ...newResultForm, interpretation: e.target.value })}
                  className="input"
                >
                  <option value="OPTIMAL">OPTIMAL — Exceeds Quality Thresholds</option>
                  <option value="PASS">PASS — Meets Experimental Standards</option>
                  <option value="BORDERLINE">BORDERLINE — Review Recommended</option>
                  <option value="FAIL">FAIL — Standard Not Met</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Observation & Findings
                </label>
                <textarea
                  value={newResultForm.observation || ''}
                  onChange={(e) => setNewResultForm({ ...newResultForm, observation: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="Notes on calibration, outliers, or repeatability..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewResultModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  Save Result
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Experiment */}
      {isEditExpModalOpen && selectedExpDetail && (
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
              maxWidth: '520px',
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
                Edit Experiment ({selectedExpDetail.experiment_code})
              </h3>
              <button
                type="button"
                onClick={() => setIsEditExpModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateExp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label">Experiment Name *</label>
                <input
                  type="text"
                  required
                  value={editExpForm.experiment_name}
                  onChange={(e) => setEditExpForm({ ...editExpForm, experiment_name: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Protocol Reference</label>
                <input
                  type="text"
                  value={editExpForm.protocol_reference || ''}
                  onChange={(e) => setEditExpForm({ ...editExpForm, protocol_reference: e.target.value })}
                  className="input font-mono"
                  placeholder="e.g. PROTO-ILLUMINA-NGS-04"
                />
              </div>

              <div>
                <label className="label">Workflow State</label>
                <select
                  value={editExpForm.status}
                  onChange={(e) => setEditExpForm({ ...editExpForm, status: e.target.value })}
                  className="input"
                >
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="label">Scientific Objective</label>
                <textarea
                  rows={3}
                  value={editExpForm.objective || ''}
                  onChange={(e) => setEditExpForm({ ...editExpForm, objective: e.target.value })}
                  className="input"
                  placeholder="Scientific hypotheses and methodology..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditExpModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontSize: '13px' }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Verify Result */}
      {isVerifyResultModalOpen && activeResultToVerify && (
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
              maxWidth: '460px',
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
                Scientifically Verify Result
              </h3>
              <DatabaseConcept topic="results" />
              <button
                type="button"
                onClick={() => setIsVerifyResultModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleVerifyResult} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--color-pale-teal)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                <div>
                  Verifying: <strong className="font-mono">{activeResultToVerify.result_code}</strong> (
                  {activeResultToVerify.result_title})
                </div>
                <div style={{ color: 'var(--color-muted)', marginTop: '4px' }}>
                  Marking this result as final locks the record against accidental modifications.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Peer Verification Notes *
                </label>
                <textarea
                  required
                  rows={3}
                  value={verifyForm.verification_notes || ''}
                  onChange={(e) => setVerifyForm({ ...verifyForm, verification_notes: e.target.value })}
                  className="input"
                  placeholder="e.g. Cross-validated against fluorometric controls. Findings validated."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsVerifyResultModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Lock size={14} /> Confirm & Lock Result
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Allocate Equipment */}
      {isAllocateEquipmentModalOpen && (
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
              maxWidth: '460px',
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
                Allocate Equipment
              </h3>
              <button
                type="button"
                onClick={() => setIsAllocateEquipmentModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAllocateEquipment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label">Select Instrument *</label>
                {availableEquipment.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--color-muted)' }}>No equipment found in registry.</p>
                ) : (
                  <select
                    className="input"
                    value={allocateEquipmentForm.equipment_id}
                    onChange={(e) =>
                      setAllocateEquipmentForm({
                        ...allocateEquipmentForm,
                        equipment_id: Number(e.target.value),
                      })
                    }
                  >
                    {availableEquipment.map((eq) => (
                      <option key={eq.equipment_id} value={eq.equipment_id}>
                        {eq.equipment_code} - {eq.equipment_name} ({eq.equipment_status})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="label">Usage Notes</label>
                <textarea
                  rows={2}
                  className="input"
                  placeholder="e.g. Reserved for thermal cycling run 2"
                  value={allocateEquipmentForm.usage_notes}
                  onChange={(e) =>
                    setAllocateEquipmentForm({
                      ...allocateEquipmentForm,
                      usage_notes: e.target.value,
                    })
                  }
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAllocateEquipmentModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontSize: '13px' }}
                  disabled={availableEquipment.length === 0}
                >
                  Allocate Equipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Result */}
      {isEditResultModalOpen && activeResultToEdit && (
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
              maxWidth: '520px',
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
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                  Edit Scientific Result
                </h3>
                <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-teal)' }}>
                  {activeResultToEdit.result_code} ({activeResultToEdit.experiment_code})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditResultModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateResult} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label">Result Title *</label>
                <input
                  type="text"
                  required
                  className="input"
                  value={editResultForm.result_title}
                  onChange={(e) => setEditResultForm({ ...editResultForm, result_title: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">Metric Value</label>
                  <input
                    type="number"
                    step="any"
                    className="input font-mono"
                    value={editResultForm.result_value ?? ''}
                    onChange={(e) =>
                      setEditResultForm({
                        ...editResultForm,
                        result_value: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input
                    type="text"
                    className="input font-mono"
                    placeholder="%, µg/mL, CFU, etc."
                    value={editResultForm.result_unit || ''}
                    onChange={(e) => setEditResultForm({ ...editResultForm, result_unit: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label">Interpretation</label>
                <select
                  className="input"
                  value={editResultForm.interpretation || 'OPTIMAL'}
                  onChange={(e) => setEditResultForm({ ...editResultForm, interpretation: e.target.value })}
                >
                  <option value="OPTIMAL">OPTIMAL</option>
                  <option value="PASS">PASS</option>
                  <option value="FAIL">FAIL</option>
                  <option value="INCONCLUSIVE">INCONCLUSIVE</option>
                  <option value="ELEVATED">ELEVATED</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              <div>
                <label className="label">Scientific Observation / Notes</label>
                <textarea
                  rows={3}
                  className="input"
                  value={editResultForm.observation || ''}
                  onChange={(e) => setEditResultForm({ ...editResultForm, observation: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="edit_result_is_final"
                  checked={editResultForm.is_final || false}
                  onChange={(e) => setEditResultForm({ ...editResultForm, is_final: e.target.checked })}
                />
                <label htmlFor="edit_result_is_final" style={{ fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
                  Mark as Scientifically Final / Verified
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditResultModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  Save Result Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
