import { DatabaseConcept } from '../../components/DatabaseConcept';
import { CompactTable } from '../../components/CompactTable';
import React, { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical,
  GitFork,
  Plus,
  Search,
  RefreshCw,
  History,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Scale,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Radio,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { ConceptInfo } from '../../components/ConceptInfo';
import { useAuth } from '../auth/AuthContext';
import { MoveSpecimenForm } from './components/MoveSpecimenForm';
import { samplesService } from './samplesService';
import { storageService } from '../storage/storageService';
import {
  SampleListItem,
  SampleDetail,
  SampleType,
  StorageHistoryItem,
  SampleCreatePayload,
  SampleDerivationPayload,
  SampleQualityMetrics,
  SampleIntegrityAlerts,
} from './types';
import { StorageLocation } from '../storage/types';
import { SampleLineagePreview } from './components/SampleLineagePreview';
import { SampleCustodyTimeline } from './components/SampleCustodyTimeline';
import { SampleQuantityVisualizer } from './components/SampleQuantityVisualizer';
import { SampleQualityMetricsPanel, QualityFilterType } from './components/SampleQualityMetricsPanel';
import { SampleIntegrityAlertsPanel } from './components/SampleIntegrityAlertsPanel';
import { SampleReadinessAssessment } from './components/SampleReadinessAssessment';
import { SampleMaterialFlowStream } from './components/SampleMaterialFlowStream';
import { SampleCryoSpatialMatrix } from './components/SampleCryoSpatialMatrix';

export const SamplesPage: React.FC<{ initialSampleId?: number }> = ({ initialSampleId }) => {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const [samples, setSamples] = useState<SampleListItem[]>([]);
  const [types, setTypes] = useState<SampleType[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [lowVolumeFilter, setLowVolumeFilter] = useState<boolean>(false);
  const [activeQualityFilter, setActiveQualityFilter] = useState<QualityFilterType>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Phase 4: Sorting & Scientific Visualisation Toggles
  const [sortBy, setSortBy] = useState<string>('registered_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [isFlowOpen, setIsFlowOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // Operational Intelligence State
  const [qualityMetrics, setQualityMetrics] = useState<SampleQualityMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [integrityAlerts, setIntegrityAlerts] = useState<SampleIntegrityAlerts | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);

  // Modals state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isDeriveOpen, setIsDeriveOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'lineage' | 'custody' | 'quantity' | 'cryo_grid'>('overview');

  // Selected sample context
  const [sampleDetail, setSampleDetail] = useState<SampleDetail | null>(null);
  const [storageHistory, setStorageHistory] = useState<StorageHistoryItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Register Form State
  const [regForm, setRegForm] = useState<SampleCreatePayload>({
    sample_code: '',
    sample_name: '',
    sample_type_id: 1,
    quantity_value: 50.0,
    quantity_unit: 'mg',
    sample_status: 'REGISTERED',
    source_description: '',
    current_storage_location_id: undefined,
    notes: '',
  });

  // Derive Form State
  const [deriveForm, setDeriveForm] = useState<SampleDerivationPayload>({
    child_sample_code: '',
    child_sample_name: '',
    child_sample_type_id: 1,
    quantity_transferred: 10.0,
    quantity_unit: 'mg',
    transformation_type: 'DNA Extraction',
    child_storage_location_id: undefined,
    notes: '',
  });
  const [deriveParent, setDeriveParent] = useState<SampleListItem | null>(null);

  const fetchSamples = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await samplesService.listSamples({
        search: search || undefined,
        typeId: typeFilter,
        status: statusFilter || undefined,
        lowVolumeOnly: lowVolumeFilter || undefined,
        page,
        pageSize,
        sortBy,
        sortDir,
      });
      setSamples(data.items);
      setTotalPages(data.total_pages);
      setTotalItems(data.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch samples.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, lowVolumeFilter, page, pageSize, sortBy, sortDir]);

  const fetchMetricsAndAlerts = useCallback(async () => {
    setMetricsLoading(true);
    setAlertsLoading(true);
    try {
      const [m, a] = await Promise.all([
        samplesService.getQualityMetrics(),
        samplesService.getIntegrityAlerts(),
      ]);
      setQualityMetrics(m);
      setIntegrityAlerts(a);
    } catch (err: unknown) {
      console.error('Failed to load quality metrics or integrity alerts', err);
    } finally {
      setMetricsLoading(false);
      setAlertsLoading(false);
    }
  }, []);

  const handleQualityFilterSelect = (filter: QualityFilterType) => {
    if (activeQualityFilter === filter && filter !== 'ALL') {
      setActiveQualityFilter('ALL');
      setStatusFilter('');
      setLowVolumeFilter(false);
      setPage(1);
      return;
    }

    setActiveQualityFilter(filter);
    setPage(1);

    switch (filter) {
      case 'ALL':
        setStatusFilter('');
        setLowVolumeFilter(false);
        break;
      case 'AVAILABLE':
        setStatusFilter('AVAILABLE');
        setLowVolumeFilter(false);
        break;
      case 'LOW_VOLUME':
        setStatusFilter('');
        setLowVolumeFilter(true);
        break;
      case 'QUARANTINED':
        setStatusFilter('QUARANTINED');
        setLowVolumeFilter(false);
        break;
      case 'MISSING':
        setStatusFilter('MISSING');
        setLowVolumeFilter(false);
        break;
      case 'DEPLETED':
        setStatusFilter('DEPLETED');
        setLowVolumeFilter(false);
        break;
    }
  };

  // Load baseline metadata (sample types, storage locations)
  useEffect(() => {
    async function loadMeta() {
      try {
        const [typesData, locsData] = await Promise.all([
          samplesService.listSampleTypes(),
          storageService.listLocations(),
        ]);
        setTypes(typesData);
        setLocations(locsData);
        if (typesData.length > 0) {
          setRegForm((prev) => ({ ...prev, sample_type_id: typesData[0].sample_type_id }));
          setDeriveForm((prev) => ({ ...prev, child_sample_type_id: typesData[0].sample_type_id }));
        }
      } catch (err: unknown) {
        console.error('Failed to load metadata', err);
      }
    }
    loadMeta();
    fetchMetricsAndAlerts();
  }, [fetchMetricsAndAlerts]);

  useEffect(() => {
    fetchSamples();
  }, [fetchSamples]);

  // View Dossier Handler
  const handleOpenDetail = useCallback(async (sampleId: number) => {
    setIsDetailOpen(true);
    setDetailLoading(true);
    try {
      const [detail, history] = await Promise.all([
        samplesService.getSampleDetail(sampleId),
        samplesService.getStorageHistory(sampleId),
      ]);
      setSampleDetail(detail);
      setStorageHistory(history);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load specimen dossier.';
      setError(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialSampleId) void handleOpenDetail(initialSampleId);
  }, [initialSampleId, handleOpenDetail]);

  // Open Derivation Modal
  const handleOpenDerive = (sample: SampleListItem) => {
    setDeriveParent(sample);
    const suggestedCode = `${sample.sample_code}-D${Math.floor(Math.random() * 900 + 100)}`;
    setDeriveForm({
      child_sample_code: suggestedCode,
      child_sample_name: `Aliquot from ${sample.sample_code}`,
      child_sample_type_id: types.length > 0 ? types[0].sample_type_id : 1,
      quantity_transferred: Math.min(10.0, sample.quantity_value),
      quantity_unit: sample.quantity_unit,
      transformation_type: 'DNA Extraction',
      child_storage_location_id: sample.current_storage_location_id,
      notes: '',
    });
    setIsDeriveOpen(true);
  };

  // Submit Register Form
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await samplesService.createSample(regForm);
      setSuccessMsg(`Specimen '${created.sample_code}' registered successfully.`);
      setIsRegisterOpen(false);
      fetchSamples();
      fetchMetricsAndAlerts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setError(msg);
    }
  };

  // Submit Derivation Form
  const handleDeriveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deriveParent) return;
    setError(null);
    try {
      const res = await samplesService.deriveChildSample(deriveParent.sample_id, deriveForm);
      setSuccessMsg(
        `Derived aliquot '${res.child_sample_code}' from '${res.parent_sample_code}'. Parent remaining stock: ${res.parent_remaining_quantity} ${deriveForm.quantity_unit}.`
      );
      setIsDeriveOpen(false);
      fetchSamples();
      fetchMetricsAndAlerts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Derivation failed.';
      setError(msg);
    }
  };

  // Sort Handler
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
    setPage(1);
  };

  // Sort Indicator Icon
  const renderSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: '5px', verticalAlign: '-1px' }} />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp size={12} style={{ color: 'var(--color-teal)', marginLeft: '5px', verticalAlign: '-1px' }} />
    ) : (
      <ArrowDown size={12} style={{ color: 'var(--color-teal)', marginLeft: '5px', verticalAlign: '-1px' }} />
    );
  };

  // Export Data Handler (CSV or JSON)
  const handleExport = async (format: 'csv' | 'json') => {
    setExportLoading(true);
    try {
      const res = await samplesService.listSamples({
        search: search || undefined,
        typeId: typeFilter,
        status: statusFilter || undefined,
        lowVolumeOnly: lowVolumeFilter || undefined,
        page: 1,
        pageSize: 500,
        sortBy,
        sortDir,
      });
      const items = res.items;
      const dateStr = new Date().toISOString().slice(0, 10);

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `biotrace_specimens_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const headers = ['Specimen ID', 'Specimen Title', 'Specimen Type', 'Stock Quantity', 'Unit', 'Storage Coordinate', 'Status', 'Registered At'];
        const rows = items.map((i) => [
          `"${(i.sample_code || '').replace(/"/g, '""')}"`,
          `"${(i.sample_name || '').replace(/"/g, '""')}"`,
          `"${(i.sample_type_code || '').replace(/"/g, '""')}"`,
          i.quantity_value,
          `"${(i.quantity_unit || '').replace(/"/g, '""')}"`,
          `"${(i.current_storage_location_code || '').replace(/"/g, '""')}"`,
          `"${(i.sample_status || '').replace(/"/g, '""')}"`,
          `"${(i.registered_at || '').replace(/"/g, '""')}"`,
        ]);
        const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `biotrace_specimens_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setIsExportOpen(false);
      setSuccessMsg(`Successfully exported ${items.length} biological specimen records as ${format.toUpperCase()}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed.';
      setError(msg);
    } finally {
      setExportLoading(false);
    }
  };

  // Keyboard Shortcuts (Escape to close modals / drawer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsRegisterOpen(false);
        setIsDeriveOpen(false);
        setIsDetailOpen(false);
        setIsExportOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'IN_STORAGE' || s === 'AVAILABLE') return 'badge-success';
    if (s === 'IN_USE' || s === 'PROCESSING') return 'badge-warning';
    if (s === 'DEPLETED' || s === 'DISPOSED') return 'badge-neutral';
    return 'badge-sand';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FlaskConical size={22} color="var(--color-teal)" />
            Biological Specimen Registry & Derivation
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
            Accessioned primary samples, atomic aliquot parent-child derivation, and physical storage coordinate tracking.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Material Flow Stream Toggle */}
          <button
            type="button"
            className={`btn ${isFlowOpen ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setIsFlowOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isFlowOpen ? 'var(--color-teal)' : undefined,
              color: isFlowOpen ? '#fff' : undefined,
              borderColor: isFlowOpen ? 'var(--color-teal)' : undefined,
            }}
            title="Toggle animated biological material flow stream diagram"
          >
            <Sparkles size={15} />
            <span>Material Flow Stream</span>
            {isFlowOpen && (
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.25)', padding: '1px 6px', borderRadius: '10px' }}>
                Active
              </span>
            )}
          </button>

          {/* Export Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsExportOpen((v) => !v)}
              disabled={exportLoading || samples.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Export biological specimen records"
            >
              <Download size={15} />
              {exportLoading ? 'Exporting...' : 'Export'}
              <ChevronDown size={14} />
            </button>
            {isExportOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  backgroundColor: 'var(--color-card-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-control)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 20,
                  minWidth: '170px',
                  padding: '6px 0',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '8px 14px',
                    border: 'none',
                    background: 'none',
                    fontSize: '13px',
                    color: 'var(--color-ink)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-pale-teal)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Export as CSV (.csv)
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('json')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '8px 14px',
                    border: 'none',
                    background: 'none',
                    fontSize: '13px',
                    color: 'var(--color-ink)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-pale-teal)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Export as JSON (.json)
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchSamples}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {canWrite && <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsRegisterOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            Register Specimen
          </button>}
        </div>
      </div>

      {/* Animated Biological Material Transformation Flow Stream */}
      {isFlowOpen && (
        <SampleMaterialFlowStream
          onSelectDestination={(destStatus) => {
            setStatusFilter(destStatus);
            setActiveQualityFilter('ALL');
            setPage(1);
          }}
          onSelectSampleType={(typeCode) => {
            const foundType = types.find((t) => t.type_code.toUpperCase() === typeCode.toUpperCase());
            if (foundType) {
              setTypeFilter(foundType.sample_type_id);
              setPage(1);
            }
          }}
        />
      )}

      <details className="optional-tools">
        <summary>Inventory diagnostics</summary>
      {/* Sample Quality & Inventory Integrity Intelligence Panel */}
      <SampleQualityMetricsPanel
        metrics={qualityMetrics}
        loading={metricsLoading}
        activeFilter={activeQualityFilter}
        onFilterSelect={handleQualityFilterSelect}
        onRefresh={fetchMetricsAndAlerts}
      />

      {/* Relational Database Invariant Alerts Audit Panel */}
      <SampleIntegrityAlertsPanel
        alertsReport={integrityAlerts}
        loading={alertsLoading}
        onInspectSample={handleOpenDetail}
      />

      </details>
      {/* Notifications */}
      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: '#FDEDEC',
          color: 'var(--color-danger)',
          border: '1px solid rgba(201, 79, 63, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
        }}>
          <AlertCircle size={18} />
          <div style={{ flex: 1 }}>{error}</div>
          <button type="button" onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: '#EBF5F0',
          color: 'var(--color-success)',
          border: '1px solid rgba(46, 125, 90, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
        }}>
          <CheckCircle2 size={18} />
          <div style={{ flex: 1 }}>{successMsg}</div>
          <button type="button" onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="card" style={{ padding: '16px 20px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--color-muted)' }} />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search specimen code, name, provenance..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div style={{ width: '200px' }}>
          <select
            className="input"
            value={typeFilter || ''}
            onChange={(e) => {
              setTypeFilter(e.target.value ? Number(e.target.value) : undefined);
              setPage(1);
            }}
          >
            <option value="">All Specimen Types</option>
            {types.map((t) => (
              <option key={t.sample_type_id} value={t.sample_type_id}>
                {t.type_code} - {t.type_name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ width: '170px' }}>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value;
              setStatusFilter(val);
              setLowVolumeFilter(false);
              if (!val) setActiveQualityFilter('ALL');
              else if (val === 'IN_STORAGE' || val === 'AVAILABLE') setActiveQualityFilter('AVAILABLE');
              else if (val === 'QUARANTINED') setActiveQualityFilter('QUARANTINED');
              else if (val === 'MISSING') setActiveQualityFilter('MISSING');
              else if (val === 'DEPLETED') setActiveQualityFilter('DEPLETED');
              else setActiveQualityFilter('ALL');
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="IN_STORAGE">IN_STORAGE</option>
            <option value="AVAILABLE">AVAILABLE</option>
            <option value="IN_USE">IN_USE</option>
            <option value="QUARANTINED">QUARANTINED</option>
            <option value="MISSING">MISSING</option>
            <option value="DEPLETED">DEPLETED</option>
            <option value="DISPOSED">DISPOSED</option>
          </select>
        </div>

        {lowVolumeFilter && (
          <span
            className="badge badge-warning"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', fontSize: '12px' }}
          >
            <span>Low-Volume Only (≤ 10.0)</span>
            <button
              type="button"
              onClick={() => handleQualityFilterSelect('ALL')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', color: 'inherit' }}
              title="Remove low-volume filter"
            >
              <X size={14} />
            </button>
          </span>
        )}
      </div>

      {/* Specimen Catalog Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <CompactTable label="samples" extra={[3, 5]} help={<DatabaseConcept topic="normalization" />}>
          <table className="table">
          <thead>
            <tr>
              <th
                style={{ width: '130px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('sample_code')}
                title="Click to sort by Specimen ID"
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Specimen ID</span>
                  {renderSortIcon('sample_code')}
                </div>
              </th>
              <th
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('sample_name')}
                title="Click to sort by Specimen Title"
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Specimen Title / Origin</span>
                  {renderSortIcon('sample_name')}
                </div>
              </th>
              <th
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('sample_type_code')}
                title="Click to sort by Specimen Type"
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Type</span>
                  {renderSortIcon('sample_type_code')}
                </div>
              </th>
              <th
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('quantity')}
                title="Click to sort by Stock Quantity"
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Current Stock</span>
                  {renderSortIcon('quantity')}
                </div>
              </th>
              <th>Storage Coordinate</th>
              <th
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('status')}
                title="Click to sort by Status"
              >
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span>Status</span>
                  {renderSortIcon('status')}
                </div>
              </th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  Loading biological specimen records...
                </td>
              </tr>
            ) : samples.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                  No biological specimens matching current criteria.
                </td>
              </tr>
            ) : (
              samples.map((s) => {
                const sStatus = (s.sample_status || '').toUpperCase();
                const isDepleted = sStatus === 'DEPLETED' || s.quantity_value <= 0;
                const cannotDerive = ['DEPLETED', 'QUARANTINED', 'DISPOSED', 'MISSING'].includes(sStatus) || s.quantity_value <= 0;
                return (
                  <tr key={s.sample_id}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                        {s.sample_code}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{s.sample_name}</div>
                      {s.is_ancient && (
                        <span className="badge badge-sand" style={{ fontSize: '10px', marginTop: '2px' }}>
                          Ancient Specimen
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-neutral font-mono">{s.sample_type_code}</span>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 600,
                        color: isDepleted ? 'var(--color-danger)' : 'var(--color-ink)',
                      }}>
                        {s.quantity_value.toFixed(1)} {s.quantity_unit}
                      </span>
                      {isDepleted && (
                        <span style={{ fontSize: '11px', color: 'var(--color-danger)', marginLeft: '6px' }}>
                          (Depleted)
                        </span>
                      )}
                    </td>
                    <td>
                      {s.current_storage_location_code ? (
                        <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-teal)' }}>
                          {s.current_storage_location_code}
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadge(s.sample_status)}`}>
                        {s.sample_status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                          onClick={() => handleOpenDetail(s.sample_id)}
                        >
                          Dossier
                        </button>
                        {canWrite && <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            borderColor: cannotDerive ? undefined : 'var(--color-teal)',
                            color: cannotDerive ? 'var(--color-muted)' : 'var(--color-teal)',
                          }}
                          disabled={cannotDerive}
                          onClick={() => handleOpenDerive(s)}
                          title={cannotDerive ? `Cannot derive: specimen is ${sStatus}` : 'Derive child aliquot'}
                        >
                          <GitFork size={13} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                          Derive
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </CompactTable>

        {/* Phase 4: Enhanced Pagination Footer with Rows-Per-Page & Page Jumping */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 20px',
          borderTop: '1px solid var(--color-border)',
          fontSize: '13px',
          color: 'var(--color-muted)',
        }}>
          <div>
            Showing {totalItems === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalItems)} of {totalItems} specimens
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Rows per page:</span>
              <select
                className="input"
                style={{ padding: '3px 8px', fontSize: '12px', width: 'auto' }}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
                disabled={page <= 1}
                onClick={() => setPage(1)}
                title="First Page"
              >
                « First
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span style={{ padding: '0 6px', fontWeight: 600, color: 'var(--color-ink)', fontSize: '12px' }}>
                Page {page} / {totalPages || 1}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                title="Last Page"
              >
                Last »
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Modal: Register Specimen                                                  */}
      {/* ========================================================================= */}
      {isRegisterOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(23, 43, 58, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div className="card" style={{ maxWidth: '580px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FlaskConical size={20} color="var(--color-teal)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Register Primary Biological Specimen
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label className="label">Sample Code *</label>
                  <input
                    type="text"
                    required
                    className="input font-mono"
                    placeholder="e.g. S007"
                    value={regForm.sample_code}
                    onChange={(e) => setRegForm({ ...regForm, sample_code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className="label">Specimen Title *</label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="e.g. Harappa Trench Femur Bone Fragment"
                    value={regForm.sample_name}
                    onChange={(e) => setRegForm({ ...regForm, sample_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div className="inline-concept">
                    <label className="label" htmlFor="new-sample-type">Sample Type *</label>
                    <DatabaseConcept topic="normalization" />
                  </div>
                  <select
                    className="input"
                    id="new-sample-type"
                    value={regForm.sample_type_id}
                    onChange={(e) => setRegForm({ ...regForm, sample_type_id: Number(e.target.value) })}
                  >
                    {types.map((t) => (
                      <option key={t.sample_type_id} value={t.sample_type_id}>
                        {t.type_code} - {t.type_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Storage Location</label>
                  <select
                    className="input"
                    value={regForm.current_storage_location_id || ''}
                    onChange={(e) =>
                      setRegForm({
                        ...regForm,
                        current_storage_location_id: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  >
                    <option value="">-- Unassigned --</option>
                    {locations.map((loc) => (
                      <option key={loc.storage_location_id} value={loc.storage_location_id}>
                        {loc.location_code} ({loc.facility} · {loc.unit_label || loc.unit_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">Initial Quantity *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="input"
                    value={regForm.quantity_value}
                    onChange={(e) => setRegForm({ ...regForm, quantity_value: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">Unit *</label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="mg, g, uL, mL"
                    value={regForm.quantity_unit}
                    onChange={(e) => setRegForm({ ...regForm, quantity_unit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Initial Status</label>
                  <select
                    className="input"
                    value={regForm.sample_status}
                    onChange={(e) => setRegForm({ ...regForm, sample_status: e.target.value })}
                  >
                    <option value="IN_STORAGE">IN_STORAGE</option>
                    <option value="REGISTERED">REGISTERED</option>
                    <option value="AVAILABLE">AVAILABLE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Provenance / Stratum Description</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Stratum IV, Depth 2.4m, Excavated Oct 2024"
                  value={regForm.source_description || ''}
                  onChange={(e) => setRegForm({ ...regForm, source_description: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Notes / Storage Precautions</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. Keep strictly at -80°C to preserve endogenous DNA"
                  value={regForm.notes || ''}
                  onChange={(e) => setRegForm({ ...regForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsRegisterOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Register Specimen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Atomic Sub-sample Derivation                                       */}
      {/* ========================================================================= */}
      {isDeriveOpen && deriveParent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(23, 43, 58, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitFork size={20} color="var(--color-teal)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Atomic Specimen Derivation & Stock Transfer
                </h3>
                <DatabaseConcept topic="transaction" />
              </div>
              <button
                type="button"
                onClick={() => setIsDeriveOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Parent specimen stock banner */}
            <div style={{
              padding: '14px 18px',
              borderRadius: 'var(--radius-control)',
              backgroundColor: 'var(--color-pale-teal)',
              border: '1px solid rgba(40, 125, 120, 0.25)',
              marginBottom: '16px',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Parent Specimen Source
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
                <div>
                  <span className="font-mono" style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-ink)' }}>
                    {deriveParent.sample_code}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--color-ink)', marginLeft: '8px' }}>
                    {deriveParent.sample_name}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Available Stock: </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-teal)' }}>
                    {deriveParent.quantity_value.toFixed(2)} {deriveParent.quantity_unit}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleDeriveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label className="label">Child Specimen ID *</label>
                  <input
                    type="text"
                    required
                    className="input font-mono"
                    value={deriveForm.child_sample_code}
                    onChange={(e) => setDeriveForm({ ...deriveForm, child_sample_code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className="label">Child Specimen Title *</label>
                  <input
                    type="text"
                    required
                    className="input"
                    value={deriveForm.child_sample_name}
                    onChange={(e) => setDeriveForm({ ...deriveForm, child_sample_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">Child Specimen Type *</label>
                  <select
                    className="input"
                    value={deriveForm.child_sample_type_id}
                    onChange={(e) => setDeriveForm({ ...deriveForm, child_sample_type_id: Number(e.target.value) })}
                  >
                    {types.map((t) => (
                      <option key={t.sample_type_id} value={t.sample_type_id}>
                        {t.type_code} - {t.type_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Transformation Operation *</label>
                  <select
                    className="input"
                    value={deriveForm.transformation_type}
                    onChange={(e) => setDeriveForm({ ...deriveForm, transformation_type: e.target.value })}
                  >
                    <option value="DNA Extraction">DNA Extraction</option>
                    <option value="Pulverization">Pulverization / Grinding</option>
                    <option value="Aliquot Partition">Aliquot Partition</option>
                    <option value="Homogenization">Homogenization</option>
                    <option value="Enzymatic Digestion">Enzymatic Digestion</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">Quantity Transferred ({deriveParent.quantity_unit}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={deriveParent.quantity_value}
                    required
                    className="input"
                    value={deriveForm.quantity_transferred}
                    onChange={(e) => setDeriveForm({ ...deriveForm, quantity_transferred: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">Initial Child Storage Coordinate</label>
                  <select
                    className="input"
                    value={deriveForm.child_storage_location_id || ''}
                    onChange={(e) =>
                      setDeriveForm({
                        ...deriveForm,
                        child_storage_location_id: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  >
                    <option value="">-- Same as Parent ({deriveParent.current_storage_location_code || 'Unassigned'}) --</option>
                    {locations.map((loc) => (
                      <option key={loc.storage_location_id} value={loc.storage_location_id}>
                        {loc.location_code} ({loc.unit_label || loc.unit_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Real-time remaining stock calculation banner */}
              {(() => {
                const remaining = deriveParent.quantity_value - (deriveForm.quantity_transferred || 0);
                const isOver = remaining < 0;
                const willDeplete = remaining === 0;

                return (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-control)',
                    backgroundColor: isOver ? '#FDEDEC' : willDeplete ? '#FEF9E7' : 'var(--color-surface)',
                    border: `1px solid ${isOver ? 'var(--color-danger)' : willDeplete ? 'var(--color-warning)' : 'var(--color-border)'}`,
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div>
                      {isOver ? (
                        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                          [!] Error: Transfer quantity exceeds available parent stock!
                        </span>
                      ) : willDeplete ? (
                        <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                          [Notice] Parent specimen will be fully DEPLETED (0.00 {deriveParent.quantity_unit} remaining).
                        </span>
                      ) : (
                        <span>
                          Estimated parent stock remaining after derivation:
                        </span>
                      )}
                    </div>
                    {!isOver && (
                      <div className="font-mono" style={{ fontWeight: 700, color: willDeplete ? 'var(--color-warning)' : 'var(--color-ink)' }}>
                        {remaining.toFixed(2)} {deriveParent.quantity_unit}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="label">Derivation Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. Aliquot reserved for Illumina sequencing run #4"
                  value={deriveForm.notes || ''}
                  onChange={(e) => setDeriveForm({ ...deriveForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsDeriveOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={deriveForm.quantity_transferred > deriveParent.quantity_value || deriveForm.quantity_transferred <= 0}
                >
                  Commit Derivation (Atomic)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Drawer / Modal: Specimen Dossier & Chronological Lineage                  */}
      {/* ========================================================================= */}
      {isDetailOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(23, 43, 58, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div className="card" style={{ maxWidth: '960px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FlaskConical size={22} color="var(--color-teal)" />
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                    Specimen Dossier: {sampleDetail?.sample_code || 'Loading...'}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                    {sampleDetail?.sample_name}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scientific Navigation Tabs */}
            {sampleDetail && (
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--color-border)',
                gap: '6px',
                marginBottom: '18px',
                overflowX: 'auto',
              }}>
                <button
                  type="button"
                  onClick={() => setDrawerTab('overview')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: drawerTab === 'overview' ? 700 : 500,
                    color: drawerTab === 'overview' ? 'var(--color-teal)' : 'var(--color-muted)',
                    borderBottom: drawerTab === 'overview' ? '2.5px solid var(--color-teal)' : '2.5px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <FlaskConical size={14} /> Specimen Overview
                </button>

                <button
                  type="button"
                  onClick={() => setDrawerTab('lineage')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: drawerTab === 'lineage' ? 700 : 500,
                    color: drawerTab === 'lineage' ? 'var(--color-teal)' : 'var(--color-muted)',
                    borderBottom: drawerTab === 'lineage' ? '2.5px solid var(--color-teal)' : '2.5px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <GitFork size={14} /> Lineage DAG
                  <span className="badge badge-sand" style={{ fontSize: '10px', padding: '1px 5px' }}>
                    {sampleDetail.ancestor_count + sampleDetail.descendant_count}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDrawerTab('custody')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: drawerTab === 'custody' ? 700 : 500,
                    color: drawerTab === 'custody' ? 'var(--color-teal)' : 'var(--color-muted)',
                    borderBottom: drawerTab === 'custody' ? '2.5px solid var(--color-teal)' : '2.5px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <History size={14} /> Chain of Custody
                  <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '1px 5px' }}>
                    {storageHistory.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDrawerTab('quantity')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: drawerTab === 'quantity' ? 700 : 500,
                    color: drawerTab === 'quantity' ? 'var(--color-teal)' : 'var(--color-muted)',
                    borderBottom: drawerTab === 'quantity' ? '2.5px solid var(--color-teal)' : '2.5px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Scale size={14} /> Quantity Ledger
                  <span className="badge badge-success" style={{ fontSize: '10px', padding: '1px 5px' }}>
                    {sampleDetail.quantity_value.toFixed(1)} {sampleDetail.quantity_unit}
                  </span>
                </button>
                <ConceptInfo title="Quantity ledger and atomic derivation" steps={['Read locked parent', 'Verify available stock', 'Debit parent and credit child', 'Commit together']}>
                  <p>Each quantity entry stores the change and resulting balance. Deriving a child commits both specimens, their lineage edge and the ledger changes in a single transaction.</p>
                </ConceptInfo>

                <button
                  type="button"
                  onClick={() => setDrawerTab('cryo_grid')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: drawerTab === 'cryo_grid' ? 700 : 500,
                    color: drawerTab === 'cryo_grid' ? 'var(--color-teal)' : 'var(--color-muted)',
                    borderBottom: drawerTab === 'cryo_grid' ? '2.5px solid var(--color-teal)' : '2.5px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Radio size={14} /> Cryo-Plate Matrix
                </button>
              </div>
            )}

            {detailLoading || !sampleDetail ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                Loading comprehensive dossier and lineage edges...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* TAB 1: Specimen Overview */}
                {drawerTab === 'overview' && (
                  <>
                    {/* Scientific Readiness & Multi-Parameter Viability Assessment */}
                    <SampleReadinessAssessment sampleId={sampleDetail.sample_id} />

                    {/* Specimen Key Properties Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '12px',
                      backgroundColor: 'var(--color-pale-teal)',
                      padding: '16px',
                      borderRadius: 'var(--radius-control)',
                    }}>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Specimen Type</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>{sampleDetail.sample_type_name} ({sampleDetail.sample_type_code})</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Current Stock</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-teal)' }}>{sampleDetail.quantity_value.toFixed(2)} {sampleDetail.quantity_unit}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Status</div>
                        <span className={`badge ${getStatusBadge(sampleDetail.sample_status)}`} style={{ marginTop: '2px' }}>
                          {sampleDetail.sample_status}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Storage Coordinate</div>
                        <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
                          {sampleDetail.current_storage_location_code || 'Unassigned'}
                        </div>
                      </div>
                    </div>

                    {canWrite && !['DISPOSED', 'DEPLETED', 'MISSING'].includes(sampleDetail.sample_status) &&
                      <MoveSpecimenForm key={sampleDetail.sample_id} sample={sampleDetail} locations={locations}
                        onSaved={async updated => {
                          setSampleDetail(updated);
                          try { setStorageHistory(await samplesService.getStorageHistory(updated.sample_id)); }
                          catch (err) { setError((err as Error).message); }
                          await fetchSamples();
                          setDrawerTab('custody');
                        }} />}

                    {/* Additional Specimen Details */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--color-ink)', marginBottom: '4px' }}>Provenance & Source</div>
                        <div style={{ color: 'var(--color-muted)', lineHeight: 1.5 }}>
                          {sampleDetail.source_description || 'No provenance details documented.'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--color-ink)', marginBottom: '4px' }}>Storage Precautions & Notes</div>
                        <div style={{ color: 'var(--color-muted)', lineHeight: 1.5 }}>
                          {sampleDetail.notes || 'No special handling instructions.'}
                        </div>
                      </div>
                    </div>

                    {/* Direct Parent and Child Lineage Connections */}
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <GitFork size={16} color="var(--color-teal)" />
                          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-ink)' }}>
                            Direct Lineage Connections
                          </h4>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '3px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => setDrawerTab('lineage')}
                        >
                          View Visual DAG Diagram <ArrowRight size={11} />
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        {/* Parents Card */}
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-control)', padding: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '8px', textTransform: 'uppercase' }}>
                            Source Parents ({sampleDetail.parents.length})
                          </div>
                          {sampleDetail.parents.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                              Primary specimen (no parent accession).
                            </div>
                          ) : (
                            sampleDetail.parents.map((p) => (
                              <div key={p.relationship_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                                <div>
                                  <span className="font-mono" style={{ fontWeight: 700, fontSize: '12px' }}>{p.related_sample_code}</span>
                                  <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{p.transformation_type}</div>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: '2px 8px', fontSize: '11px' }}
                                  onClick={() => handleOpenDetail(p.related_sample_id)}
                                >
                                  Jump <ArrowRight size={11} style={{ verticalAlign: '-1px' }} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Children Card */}
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-control)', padding: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '8px', textTransform: 'uppercase' }}>
                            Derived Child Aliquots ({sampleDetail.children.length})
                          </div>
                          {sampleDetail.children.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                              No child aliquots or extracts derived yet.
                            </div>
                          ) : (
                            sampleDetail.children.map((c) => (
                              <div key={c.relationship_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                                <div>
                                  <span className="font-mono" style={{ fontWeight: 700, fontSize: '12px' }}>{c.related_sample_code}</span>
                                  <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                                    {c.transformation_type} ({c.quantity_transferred} {c.quantity_unit || 'mg'})
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: '2px 8px', fontSize: '11px' }}
                                  onClick={() => handleOpenDetail(c.related_sample_id)}
                                >
                                  Jump <ArrowRight size={11} style={{ verticalAlign: '-1px' }} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Associated Quality Control Assays */}
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <CheckCircle2 size={16} color="var(--color-teal)" />
                        <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-ink)' }}>
                          Associated Quality Control Assays ({sampleDetail.qc_tests?.length || 0} Recorded)
                        </h4>
                      </div>

                      {!sampleDetail.qc_tests || sampleDetail.qc_tests.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--color-muted)', padding: '12px', backgroundColor: 'var(--color-background)', borderRadius: 'var(--radius-control)' }}>
                          No quality control assay records found for this specimen.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {sampleDetail.qc_tests.map((qc) => (
                            <div
                              key={qc.sample_test_id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px 12px',
                                backgroundColor: 'var(--color-background)',
                                borderRadius: 'var(--radius-control)',
                                fontSize: '12px',
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                                  {qc.test_type}
                                </span>
                                <span className="badge badge-neutral" style={{ marginLeft: '8px', fontSize: '10px' }}>
                                  {qc.test_status}
                                </span>
                                {qc.result_value !== undefined && qc.result_value !== null && (
                                  <div style={{ color: 'var(--color-teal)', fontWeight: 600, marginTop: '2px' }}>
                                    Result: {qc.result_value} {qc.result_unit || ''} {qc.result_interpretation ? `— ${qc.result_interpretation}` : ''}
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: 'right', color: 'var(--color-muted)', fontSize: '11px' }}>
                                {qc.performed_at ? new Date(qc.performed_at).toLocaleDateString() : new Date(qc.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* TAB 2: Visual Lineage DAG */}
                {drawerTab === 'lineage' && (
                  <SampleLineagePreview
                    sampleId={sampleDetail.sample_id}
                    sampleCode={sampleDetail.sample_code}
                    onSelectSample={handleOpenDetail}
                  />
                )}

                {/* TAB 3: Chain of Custody Timeline */}
                {drawerTab === 'custody' && (
                  <SampleCustodyTimeline
                    sampleId={sampleDetail.sample_id}
                    sampleCode={sampleDetail.sample_code}
                  />
                )}

                {/* TAB 4: Quantity & Aliquot Ledger */}
                {drawerTab === 'quantity' && (
                  <SampleQuantityVisualizer
                    sampleId={sampleDetail.sample_id}
                    sampleCode={sampleDetail.sample_code}
                    onSelectSample={handleOpenDetail}
                  />
                )}

                {/* TAB 5: 96-Well Cryogenic Spatial Coordinate Matrix with Sonar Pulse */}
                {drawerTab === 'cryo_grid' && (
                  <SampleCryoSpatialMatrix
                    sampleId={sampleDetail.sample_id}
                    onSelectSample={handleOpenDetail}
                  />
                )}

                {/* Footer Controls */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsDetailOpen(false)}
                  >
                    Close Dossier
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
