import { DatabaseConcept } from '../../components/DatabaseConcept';
import { CompactTable } from '../../components/CompactTable';
import { useAuth } from '../auth/AuthContext';
import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Plus,
  Search,
  RefreshCw,
  X,
  AlertCircle,
  AlertTriangle,
  Clock,
  Activity,
  FileCheck2,
  Calendar,
  User,
  FlaskConical,
  ShieldAlert,
  Scale,
  Ban,
  Check,
  Award,
  Layers,
  TrendingUp,
  Printer,
  Sparkles,
} from 'lucide-react';
import { testsService } from './testsService';
import { samplesService } from '../samples/samplesService';
import { TestQualityPanel } from './TestQualityPanel';
import { CapillaryElectropherogramObservatory } from './CapillaryElectropherogramObservatory';
import {
  TestListItem,
  TestDetail,
  TestCreatePayload,
  TestUpdatePayload,
  QCEvaluationResponse,
  SpecimenClearanceDossier,
  InstrumentQCReport,
  BatchTestCreatePayload,
  BatchTestCreateResponse,
  TestQualityMetricsResponse,
} from './types';
import { SampleListItem } from '../samples/types';

const ASSAY_PRESETS = [
  { name: 'Qubit 4 Fluorometer dsDNA High Sensitivity', unit: 'ng/uL', defaultVal: 20.0, defaultConsume: 2.0 },
  { name: 'qPCR Ancient DNA 16S Environmental Bacterial Screen', unit: 'copies/uL', defaultVal: 50.0, defaultConsume: 5.0, isDiagnostic: true },
  { name: 'Agilent Bioanalyzer 2100 DNA 1000 Fragment Sizing', unit: 'bp', defaultVal: 180.0, defaultConsume: 1.0 },
  { name: 'TapeStation 4200 Genomic DNA DIN Integrity Score', unit: 'DIN', defaultVal: 6.8, defaultConsume: 1.0 },
  { name: 'Radiocarbon 14C Accelerator Mass Spectrometry (AMS)', unit: 'years BP', defaultVal: 4500.0, defaultConsume: 15.0 },
  { name: 'Optical Visual Microscopic Examination (Non-Destructive)', unit: 'grade', defaultVal: 1.0, defaultConsume: 0.0 },
  { name: 'Sterility & Environmental Endotoxin Clearance Assay', unit: 'EU/mL', defaultVal: 0.05, defaultConsume: 2.0, isDiagnostic: true },
];

export const TestsPage: React.FC<{ initialAssayId?: number }> = ({ initialAssayId }) => {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const [tests, setTests] = useState<TestListItem[]>([]);
  const [samplesList, setSamplesList] = useState<SampleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modals state
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Phase 2 Modals State
  const [isCoAOpen, setIsCoAOpen] = useState(false);
  const [coADossier, setCoADossier] = useState<SpecimenClearanceDossier | null>(null);
  const [coALoading, setCoALoading] = useState(false);

  const [isDriftOpen, setIsDriftOpen] = useState(false);
  const [driftReports, setDriftReports] = useState<InstrumentQCReport[]>([]);
  const [driftLoading, setDriftLoading] = useState(false);

  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [selectedBatchSamples, setSelectedBatchSamples] = useState<number[]>([]);
  const [batchForm, setBatchForm] = useState<BatchTestCreatePayload>({
    sample_ids: [],
    test_type: ASSAY_PRESETS[0].name,
    batch_run_identifier: '',
    quantity_consumed_per_sample: 1.0,
    result_unit: ASSAY_PRESETS[0].unit,
    observation: '',
  });
  const [batchResult, setBatchResult] = useState<BatchTestCreateResponse | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // Selected test context
  const [selectedTest, setSelectedTest] = useState<TestListItem | null>(null);
  const [testDetail, setTestDetail] = useState<TestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Live QC Evaluation State in Update Modal
  const [qcEvaluation, setQcEvaluation] = useState<QCEvaluationResponse | null>(null);
  const [qcEvaluating, setQcEvaluating] = useState(false);

  // Phase 3: Operational Quality Metrics & Observatory
  const [qualityMetrics, setQualityMetrics] = useState<TestQualityMetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [selectedTestIdForViz, setSelectedTestIdForViz] = useState<number | undefined>(undefined);
  const [showObservatory, setShowObservatory] = useState(false);

  // Create Form State
  const [createForm, setCreateForm] = useState<TestCreatePayload>({
    sample_id: 1,
    test_type: ASSAY_PRESETS[0].name,
    test_status: 'requested',
    observation: '',
    result_value: undefined,
    result_unit: ASSAY_PRESETS[0].unit,
    result_interpretation: undefined,
    quantity_consumed: 0,
    auto_quarantine_on_failure: true,
  });

  // Update Form State
  const [updateForm, setUpdateForm] = useState<TestUpdatePayload>({
    test_status: 'completed',
    result_value: undefined,
    result_unit: 'ng/uL',
    result_interpretation: 'PASS',
    observation: '',
    quantity_consumed: undefined,
    auto_quarantine_on_failure: true,
    cancellation_reason: '',
  });

  const fetchTests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await testsService.listTests({
        search: search || undefined,
        status: statusFilter || undefined,
        outcome: outcomeFilter || undefined,
        page,
        pageSize: 15,
      });
      setTests(data.items);
      setTotalPages(data.total_pages);
      setTotalItems(data.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch analytical assays.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, outcomeFilter, page]);

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const data = await testsService.getQualityMetrics();
      setQualityMetrics(data);
    } catch (err: unknown) {
      console.error('Failed to load analytical quality metrics', err);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  // Load sample catalog for target specimen selector
  useEffect(() => {
    async function loadSamples() {
      try {
        const data = await samplesService.listSamples({ pageSize: 100 });
        setSamplesList(data.items);
        if (data.items.length > 0) {
          setCreateForm((prev) => ({ ...prev, sample_id: data.items[0].sample_id }));
        }
      } catch (err: unknown) {
        console.error('Failed to load sample list', err);
      }
    }
    loadSamples();
  }, []);

  useEffect(() => {
    fetchTests();
    fetchMetrics();
  }, [fetchTests, fetchMetrics]);

  // Keep first test selected for Observatory by default
  useEffect(() => {
    if (tests.length > 0 && !selectedTestIdForViz) {
      setSelectedTestIdForViz(tests[0].sample_test_id);
    }
  }, [tests, selectedTestIdForViz]);

  // View Assay Dossier
  const handleOpenDetail = useCallback(async (testId: number) => {
    setIsDetailOpen(true);
    setDetailLoading(true);
    try {
      const detail = await testsService.getTestDetail(testId);
      setTestDetail(detail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load assay dossier.';
      setError(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialAssayId) void handleOpenDetail(initialAssayId);
  }, [initialAssayId, handleOpenDetail]);

  // Open Update Outcome Modal
  const handleOpenUpdate = (test: TestListItem) => {
    setSelectedTest(test);
    setQcEvaluation(null);
    setUpdateForm({
      test_status: test.test_status === 'requested' ? 'in_progress' : test.test_status,
      result_value: test.result_value,
      result_unit: test.result_unit || 'ng/uL',
      result_interpretation: test.result_interpretation || 'OPTIMAL',
      observation: '',
      quantity_consumed: undefined,
      auto_quarantine_on_failure: true,
      cancellation_reason: '',
    });
    setIsUpdateOpen(true);
  };

  // Phase 2: Open Certificate of Analysis (CoA)
  const handleOpenCoA = async (sampleId: number) => {
    setIsCoAOpen(true);
    setCoALoading(true);
    setCoADossier(null);
    try {
      const dossier = await testsService.getSpecimenClearance(sampleId);
      setCoADossier(dossier);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate Certificate of Analysis.';
      setError(msg);
    } finally {
      setCoALoading(false);
    }
  };

  // Phase 2: Open Instrument Drift Analytics
  const handleOpenDrift = async () => {
    setIsDriftOpen(true);
    setDriftLoading(true);
    try {
      const reports = await testsService.getInstrumentDrift();
      setDriftReports(reports);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load statistical QC reports.';
      setError(msg);
    } finally {
      setDriftLoading(false);
    }
  };

  // Phase 2: Open Batch Modal
  const handleOpenBatch = () => {
    const defaultBatchId = `RUN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-OCTA-01`;
    // Preselect available IN_STORAGE specimens up to 8
    const defaultSelected = samplesList
      .filter((s) => s.sample_status === 'IN_STORAGE' && Number(s.quantity_value) > 2)
      .slice(0, 8)
      .map((s) => s.sample_id);

    setSelectedBatchSamples(defaultSelected);
    setBatchForm({
      sample_ids: defaultSelected,
      test_type: ASSAY_PRESETS[0].name,
      batch_run_identifier: defaultBatchId,
      quantity_consumed_per_sample: 1.0,
      result_unit: ASSAY_PRESETS[0].unit,
      observation: 'Automated 8-channel optical measurement run',
    });
    setBatchResult(null);
    setIsBatchOpen(true);
  };

  // Phase 2: Automated QC Evaluation Trigger in Update Modal
  const handleTriggerQCEvaluation = async () => {
    if (updateForm.result_value === undefined || updateForm.result_value === null) {
      setError('Enter a numerical metric reading to evaluate QC tolerance thresholds.');
      return;
    }
    setQcEvaluating(true);
    setError(null);
    try {
      const res = await testsService.evaluateQC({
        test_type: selectedTest?.test_type || '',
        result_value: Number(updateForm.result_value),
        result_unit: updateForm.result_unit,
      });
      setQcEvaluation(res);
      // Auto-set the recommended interpretation
      setUpdateForm((prev) => ({
        ...prev,
        result_interpretation: res.recommended_interpretation,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to evaluate QC thresholds.';
      setError(msg);
    } finally {
      setQcEvaluating(false);
    }
  };

  // Submit Schedule Form
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetSpecimen = samplesList.find((s) => s.sample_id === createForm.sample_id);
    if (targetSpecimen && (targetSpecimen.sample_status === 'DISPOSED' || targetSpecimen.sample_status === 'MISSING')) {
      setError(`Cannot schedule assay: specimen '${targetSpecimen.sample_code}' is ${targetSpecimen.sample_status}.`);
      return;
    }

    try {
      const created = await testsService.createTest(createForm);
      setSuccessMsg(`Assay '${created.test_type}' scheduled for specimen '${created.sample_code}'.`);
      setIsScheduleOpen(false);
      fetchTests();
      fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to schedule assay.';
      setError(msg);
    }
  };

  // Submit Outcome Update Form
  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTest) return;
    setError(null);

    if (updateForm.test_status === 'cancelled' && !updateForm.cancellation_reason?.trim()) {
      setError('A regulatory cancellation justification is required when cancelling an analytical assay.');
      return;
    }

    try {
      const updated = await testsService.updateTest(selectedTest.sample_test_id, updateForm);
      setSuccessMsg(
        `Assay #${updated.sample_test_id} updated: Status=${updated.test_status}${
          updated.sample_quarantined_by_test ? ' · [SPECIMEN AUTO-QUARANTINED]' : ''
        }.`
      );
      setIsUpdateOpen(false);
      fetchTests();
      fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update assay.';
      setError(msg);
    }
  };

  // Submit Batch Scheduling
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBatchSamples.length === 0) {
      setError('Select at least one biological specimen for batch assay scheduling.');
      return;
    }
    setBatchSubmitting(true);
    setError(null);
    try {
      const res = await testsService.createBatchTests({
        ...batchForm,
        sample_ids: selectedBatchSamples,
      });
      setBatchResult(res);
      setSuccessMsg(`Batch run '${res.batch_run_identifier}' scheduled ${res.scheduled_count} assay(s) (${res.skipped_count} skipped).`);
      fetchTests();
      fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to schedule batch assay run.';
      setError(msg);
    } finally {
      setBatchSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'completed') return 'badge-success';
    if (s === 'in_progress') return 'badge-warning';
    if (s === 'requested') return 'badge-sand';
    if (s === 'cancelled') return 'badge-danger';
    return 'badge-neutral';
  };

  const getInterpretationBadge = (interp?: string) => {
    if (!interp) return 'badge-neutral';
    const i = interp.toUpperCase();
    if (i === 'PASS' || i === 'OPTIMAL') return 'badge-success';
    if (i === 'BORDERLINE') return 'badge-warning';
    if (i === 'FAIL' || i === 'CONTAMINATED' || i === 'DEGRADED') return 'badge-danger';
    return 'badge-sand';
  };

  const getSampleStatusBadge = (status?: string) => {
    if (!status) return 'badge-neutral';
    const s = status.toUpperCase();
    if (s === 'IN_STORAGE') return 'badge-success';
    if (s === 'IN_USE') return 'badge-warning';
    if (s === 'QUARANTINED') return 'badge-danger';
    if (s === 'DEPLETED') return 'badge-neutral';
    return 'badge-sand';
  };

  // Inspect current target specimen in create modal
  const activeSelectedSpecimen = samplesList.find((s) => s.sample_id === createForm.sample_id);
  const isSpecimenBlocked =
    activeSelectedSpecimen?.sample_status === 'DISPOSED' || activeSelectedSpecimen?.sample_status === 'MISSING';
  const isSpecimenQuarantined = activeSelectedSpecimen?.sample_status === 'QUARANTINED';
  const isSpecimenDepleted = activeSelectedSpecimen?.sample_status === 'DEPLETED';
  const specimenStock = activeSelectedSpecimen?.quantity_value ? Number(activeSelectedSpecimen.quantity_value) : 0;
  const isOverdraft = (createForm.quantity_consumed || 0) > specimenStock;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={22} color="var(--color-teal)" />
            Laboratory Quality & Analytical Testing
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
            Phase 3 Operational Intelligence: Interactive capillary electropherogram observatory, live QC decision thresholds, Certificate of Analysis release, and statistical drift monitoring.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${showObservatory ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowObservatory(!showObservatory)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Toggle Live Capillary Electropherogram Observatory"
          >
            <Activity size={15} />
            {showObservatory ? 'Hide Observatory' : 'Show Observatory'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleOpenDrift}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <TrendingUp size={15} color="var(--color-teal)" />
            Instrument Drift
          </button>
          <button disabled={!canWrite}
            type="button"
            className="btn btn-secondary"
            onClick={handleOpenBatch}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Layers size={15} color="var(--color-teal)" />
            Batch Assay Run
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              fetchTests();
              fetchMetrics();
            }}
            disabled={loading || metricsLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={15} className={loading || metricsLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button disabled={!canWrite}
            type="button"
            className="btn btn-primary"
            onClick={() => setIsScheduleOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            Schedule Assay
          </button>
        </div>
      </div>

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

      {/* Phase 3: Analytical Quality KPIs & Protocol Breakdown */}
      <TestQualityPanel
        metrics={qualityMetrics}
        loading={metricsLoading}
        onFilterByStatus={(st) => {
          setStatusFilter(st);
          setPage(1);
        }}
        onFilterByOutcome={(oc) => {
          setOutcomeFilter(oc);
          setPage(1);
        }}
      />

      {/* Phase 3: Live Capillary Electropherogram & Kinetic Observatory */}
      {showObservatory && (
        <CapillaryElectropherogramObservatory
          tests={tests}
          selectedTestId={selectedTestIdForViz}
          onSelectTest={(test) => setSelectedTestIdForViz(test.sample_test_id)}
        />
      )}

      {/* Filters Toolbar */}
      <div className="card" style={{ padding: '16px 20px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--color-muted)' }} />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search assay protocol, observation, specimen code..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div style={{ width: '180px' }}>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Execution States</option>
            <option value="requested">requested</option>
            <option value="in_progress">in_progress</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>

        <div style={{ width: '190px' }}>
          <select
            className="input"
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All QC Interpretations</option>
            <option value="OPTIMAL">OPTIMAL</option>
            <option value="PASS">PASS</option>
            <option value="BORDERLINE">BORDERLINE</option>
            <option value="FAIL">FAIL</option>
            <option value="CONTAMINATED">CONTAMINATED</option>
            <option value="INCONCLUSIVE">INCONCLUSIVE</option>
          </select>
        </div>
      </div>

      {/* Analytical Assays Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <CompactTable label="assays" extra={[1, 5, 7]} help={<DatabaseConcept topic="assays" />}>
          <table className="table">
          <thead>
            <tr>
              <th style={{ width: '85px' }}>Assay ID</th>
              <th>Target Specimen</th>
              <th>Assay Protocol / Type</th>
              <th>Execution Status</th>
              <th>Quantitative Reading</th>
              <th>QC Interpretation</th>
              <th>Performed By / Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  Loading analytical assay records...
                </td>
              </tr>
            ) : tests.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-muted)' }}>
                  No analytical tests matching current criteria.
                </td>
              </tr>
            ) : (
              tests.map((t) => {
                const isSelected = selectedTestIdForViz === t.sample_test_id;
                return (
                  <tr
                    key={t.sample_test_id}
                    onClick={() => setSelectedTestIdForViz(t.sample_test_id)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'rgba(38, 128, 137, 0.08)' : undefined,
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td>
                      <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                        #{t.sample_test_id}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-teal)' }}>
                          {t.sample_code}
                        </span>
                        <span className="badge badge-neutral font-mono" style={{ fontSize: '9px' }}>
                          {t.sample_type_code}
                        </span>
                        {t.sample_status && (
                          <span className={`badge ${getSampleStatusBadge(t.sample_status)} font-mono`} style={{ fontSize: '9px' }}>
                            {t.sample_status}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>{t.sample_name}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{t.test_type}</div>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadge(t.test_status)}`}>
                        {t.test_status}
                      </span>
                    </td>
                    <td>
                      {t.result_value !== undefined && t.result_value !== null ? (
                        <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                          {t.result_value.toFixed(2)} {t.result_unit}
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Pending reading</span>
                      )}
                    </td>
                    <td>
                      {t.result_interpretation ? (
                        <span className={`badge ${getInterpretationBadge(t.result_interpretation)}`}>
                          {t.result_interpretation}
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', color: 'var(--color-ink)' }}>
                        {t.performed_by_name || 'System Operator'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                        {t.performed_at
                          ? new Date(t.performed_at).toLocaleDateString()
                          : t.requested_at
                          ? `Req: ${new Date(t.requested_at).toLocaleDateString()}`
                          : 'Scheduled'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          type="button"
                          className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTestIdForViz(t.sample_test_id);
                            if (!showObservatory) setShowObservatory(true);
                          }}
                          title="Inspect in Live Capillary Electropherogram Observatory"
                        >
                          <Activity size={13} />
                          Scan
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCoA(t.sample_id);
                          }}
                          title="Generate Certificate of Analysis & Study Release Clearance"
                        >
                          <Award size={13} color="var(--color-teal)" />
                          CoA
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(t.sample_test_id);
                          }}
                        >
                          Dossier
                        </button>
                        <button disabled={!canWrite}
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-teal)', borderColor: 'var(--color-teal)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenUpdate(t);
                          }}
                        >
                          Update
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </CompactTable>

        {/* Pagination Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          borderTop: '1px solid var(--color-border)',
          fontSize: '13px',
          color: 'var(--color-muted)',
        }}>
          <div>
            Showing {tests.length} of {totalItems} assays (Page {page} of {totalPages || 1})
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Modal: Schedule Assay                                                     */}
      {/* ========================================================================= */}
      {isScheduleOpen && (
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
          <div className="card" style={{ maxWidth: '620px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} color="var(--color-teal)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Schedule Analytical Laboratory Assay
                </h3>
                <DatabaseConcept topic="assays" />
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label">Target Biological Specimen *</label>
                <select
                  className="input font-mono"
                  value={createForm.sample_id}
                  onChange={(e) => setCreateForm({ ...createForm, sample_id: Number(e.target.value) })}
                >
                  {samplesList.map((s) => (
                    <option key={s.sample_id} value={s.sample_id}>
                      {s.sample_code} · {s.sample_name} [{s.sample_status}] ({s.quantity_value} {s.quantity_unit})
                    </option>
                  ))}
                </select>

                {isSpecimenBlocked && (
                  <div style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-control)',
                    backgroundColor: '#FDEDEC',
                    border: '1px solid rgba(201, 79, 63, 0.4)',
                    color: 'var(--color-danger)',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <Ban size={16} />
                    <div>
                      <strong>Specimen Inactive:</strong> Specimen is marked as <strong>{activeSelectedSpecimen?.sample_status}</strong>. Testing prohibited.
                    </div>
                  </div>
                )}

                {isSpecimenQuarantined && (
                  <div style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-control)',
                    backgroundColor: '#FEF9E7',
                    border: '1px solid rgba(217, 131, 36, 0.4)',
                    color: 'var(--color-warning)',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <ShieldAlert size={16} />
                    <div>
                      <strong>Quarantined Specimen:</strong> Specimen is under quarantine. Only diagnostic contamination screens are permitted.
                    </div>
                  </div>
                )}

                {isSpecimenDepleted && (
                  <div style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-control)',
                    backgroundColor: '#F4F6F9',
                    border: '1px solid rgba(75, 105, 135, 0.3)',
                    color: 'var(--color-ink)',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <Scale size={16} color="var(--color-teal)" />
                    <div>
                      <strong>Depleted Specimen (0.00 quantity):</strong> Only non-destructive visual/imaging assays consuming 0.00 quantity can be performed.
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="label">Analytical Assay Protocol Preset</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {ASSAY_PRESETS.map((p) => {
                    const isSelected = createForm.test_type === p.name;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        className="badge badge-sand"
                        style={{
                          cursor: 'pointer',
                          border: isSelected ? '1px solid var(--color-teal)' : '1px solid transparent',
                          backgroundColor: isSelected ? 'var(--color-pale-teal)' : undefined,
                          color: isSelected ? 'var(--color-teal)' : undefined,
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        onClick={() =>
                          setCreateForm({
                            ...createForm,
                            test_type: p.name,
                            result_unit: p.unit,
                            quantity_consumed: p.defaultConsume,
                          })
                        }
                      >
                        {isSelected && <Check size={12} />}
                        {p.name.split(' ')[0]} {p.name.split(' ')[1]}
                        {p.isDiagnostic && <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>*</span>}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  required
                  className="input"
                  placeholder="Assay Protocol Title"
                  value={createForm.test_type}
                  onChange={(e) => setCreateForm({ ...createForm, test_type: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">Initial Assay Status</label>
                  <select
                    className="input"
                    value={createForm.test_status}
                    onChange={(e) => setCreateForm({ ...createForm, test_status: e.target.value })}
                  >
                    <option value="requested">requested (Scheduled)</option>
                    <option value="in_progress">in_progress (Under execution)</option>
                    <option value="completed">completed (Outcome recorded)</option>
                  </select>
                </div>

                <div>
                  <label className="label">Measurement Unit</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. ng/uL, DIN, bp"
                    value={createForm.result_unit || ''}
                    onChange={(e) => setCreateForm({ ...createForm, result_unit: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ padding: '12px 14px', backgroundColor: 'var(--color-background)', borderRadius: 'var(--radius-control)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="label" style={{ margin: 0 }}>
                    Specimen Stock Consumption (Optional)
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                    Available Stock: <strong>{specimenStock} {activeSelectedSpecimen?.quantity_unit || 'mg'}</strong>
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className="input font-mono"
                    placeholder="0.00"
                    value={createForm.quantity_consumed !== undefined ? createForm.quantity_consumed : ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        quantity_consumed: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                  <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-teal)', fontWeight: 600, minWidth: '40px' }}>
                    {activeSelectedSpecimen?.quantity_unit || 'mg'}
                  </span>
                </div>

                {isOverdraft && (
                  <div style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={13} />
                    Stock overdraft: requested consumption ({createForm.quantity_consumed}) exceeds available quantity ({specimenStock}).
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="auto_quarantine_cb"
                  checked={createForm.auto_quarantine_on_failure ?? true}
                  onChange={(e) => setCreateForm({ ...createForm, auto_quarantine_on_failure: e.target.checked })}
                />
                <label htmlFor="auto_quarantine_cb" style={{ fontSize: '12px', color: 'var(--color-ink)', cursor: 'pointer' }}>
                  Auto-quarantine specimen if assay outcome is recorded as <strong>FAIL</strong> or <strong>CONTAMINATED</strong>
                </label>
              </div>

              <div>
                <label className="label">Protocol / Sampling Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. Specimen diluted 1:10 with TE buffer prior to fluorescence assay"
                  value={createForm.observation || ''}
                  onChange={(e) => setCreateForm({ ...createForm, observation: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsScheduleOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSpecimenBlocked || isOverdraft}
                >
                  Confirm Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Update Assay Outcome with Live Scientific QC Evaluation Engine     */}
      {/* ========================================================================= */}
      {isUpdateOpen && selectedTest && (
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
          <div className="card" style={{ maxWidth: '620px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={20} color="var(--color-teal)" />
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                    Update Assay Outcome #{selectedTest.sample_test_id}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                    {selectedTest.test_type} · {selectedTest.sample_code}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUpdateOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">Execution Status *</label>
                  <select
                    className="input"
                    value={updateForm.test_status}
                    onChange={(e) => setUpdateForm({ ...updateForm, test_status: e.target.value })}
                  >
                    <option value="in_progress">in_progress</option>
                    <option value="completed">completed</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="label">QC Interpretation</label>
                  <select
                    className="input"
                    value={updateForm.result_interpretation || ''}
                    onChange={(e) => setUpdateForm({ ...updateForm, result_interpretation: e.target.value })}
                  >
                    <option value="OPTIMAL">OPTIMAL</option>
                    <option value="PASS">PASS</option>
                    <option value="BORDERLINE">BORDERLINE</option>
                    <option value="FAIL">FAIL</option>
                    <option value="CONTAMINATED">CONTAMINATED</option>
                    <option value="INCONCLUSIVE">INCONCLUSIVE</option>
                  </select>
                </div>
              </div>

              {/* Numerical Metric Reading with Live QC Decision Engine */}
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="label">Quantitative Metric Value</label>
                    <input
                      type="number"
                      step="0.0001"
                      className="input font-mono"
                      placeholder="e.g. 24.8"
                      value={updateForm.result_value !== undefined && updateForm.result_value !== null ? updateForm.result_value : ''}
                      onChange={(e) =>
                        setUpdateForm({
                          ...updateForm,
                          result_value: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="label">Unit</label>
                    <input
                      type="text"
                      className="input font-mono"
                      value={updateForm.result_unit || ''}
                      onChange={(e) => setUpdateForm({ ...updateForm, result_unit: e.target.value })}
                    />
                  </div>
                </div>

                {/* Phase 2 Live QC Evaluator Button */}
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={handleTriggerQCEvaluation}
                    disabled={qcEvaluating || updateForm.result_value === undefined}
                  >
                    <Sparkles size={13} color="var(--color-teal)" />
                    {qcEvaluating ? 'Evaluating QC Criteria...' : 'Evaluate Scientific QC Criteria'}
                  </button>
                </div>

                {/* Phase 2 QC Decision Engine Interactive Card */}
                {qcEvaluation && (
                  <div style={{
                    marginTop: '8px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-control)',
                    backgroundColor: 'var(--color-pale-teal)',
                    border: '1px solid rgba(40, 125, 120, 0.3)',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                        {qcEvaluation.parameter_name}
                      </span>
                      <span className={`badge ${getInterpretationBadge(qcEvaluation.recommended_interpretation)}`}>
                        {qcEvaluation.recommended_interpretation} ({qcEvaluation.compliance_level})
                      </span>
                    </div>
                    <div style={{ color: 'var(--color-ink)', fontSize: '11px' }}>
                      <strong>Standard:</strong> {qcEvaluation.reference_standard} · <strong>Confidence:</strong> {qcEvaluation.confidence_score.toFixed(1)}%
                    </div>
                    <div style={{ color: 'var(--color-muted)', fontSize: '11px', lineHeight: 1.4 }}>
                      {qcEvaluation.threshold_criteria}
                    </div>
                    <div style={{ color: 'var(--color-teal)', fontWeight: 600, fontSize: '11px', marginTop: '2px' }}>
                      👉 Guidance: {qcEvaluation.laboratory_guidance}
                    </div>
                  </div>
                )}
              </div>

              {/* Mandatory Cancellation Justification Field */}
              {updateForm.test_status === 'cancelled' && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-control)',
                  backgroundColor: '#FDEDEC',
                  border: '1px solid rgba(201, 79, 63, 0.4)',
                }}>
                  <label className="label" style={{ color: 'var(--color-danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={15} />
                    Cancellation Justification (Mandatory under ISO 17025) *
                  </label>
                  <textarea
                    required
                    rows={2}
                    className="input"
                    placeholder="Provide analytical reason for aborting or cancelling assay (e.g., baseline drift, reagent expiration, mechanical failure)..."
                    value={updateForm.cancellation_reason || ''}
                    onChange={(e) => setUpdateForm({ ...updateForm, cancellation_reason: e.target.value })}
                  />
                </div>
              )}

              {/* QC Failure Quarantine Cascade Warning */}
              {(updateForm.result_interpretation === 'FAIL' || updateForm.result_interpretation === 'CONTAMINATED') && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-control)',
                  backgroundColor: '#FEF9E7',
                  border: '1px solid rgba(217, 131, 36, 0.4)',
                  color: 'var(--color-warning)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <ShieldAlert size={18} />
                  <div>
                    <strong>Automated Quarantine Guardrail:</strong> Recording this assay as <strong>{updateForm.result_interpretation}</strong> will automatically quarantine specimen <strong>{selectedTest.sample_code}</strong>.
                  </div>
                </div>
              )}

              {/* Physical Specimen Quantity Consumed */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label className="label">Specimen Quantity Consumed (if destructive)</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className="input font-mono"
                    placeholder="0.00"
                    value={updateForm.quantity_consumed !== undefined ? updateForm.quantity_consumed : ''}
                    onChange={(e) =>
                      setUpdateForm({
                        ...updateForm,
                        quantity_consumed: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div style={{ width: '45%', paddingTop: '18px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={updateForm.auto_quarantine_on_failure ?? true}
                      onChange={(e) => setUpdateForm({ ...updateForm, auto_quarantine_on_failure: e.target.checked })}
                    />
                    Quarantine on QC fail
                  </label>
                </div>
              </div>

              <div>
                <label className="label">Analytical Observations & Instrument Logs</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. Standard curve linear regression R^2 = 0.9998; peak fluorescence within dynamic range"
                  value={updateForm.observation || ''}
                  onChange={(e) => setUpdateForm({ ...updateForm, observation: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsUpdateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updateForm.test_status === 'cancelled' && !updateForm.cancellation_reason?.trim()}
                >
                  Record Outcome
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Assay Dossier                                                      */}
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
          <div className="card" style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileCheck2 size={22} color="var(--color-teal)" />
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                    Assay Dossier #{testDetail?.sample_test_id}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                    {testDetail?.test_type}
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

            {detailLoading || !testDetail ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                Loading comprehensive assay dossier...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-control)',
                  backgroundColor: 'var(--color-pale-teal)',
                  border: '1px solid rgba(40, 125, 120, 0.25)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Quantitative Assay Measurement
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink)', marginTop: '2px' }}>
                      {testDetail.result_value !== undefined && testDetail.result_value !== null ? (
                        <>
                          <span className="font-mono">{testDetail.result_value.toFixed(2)}</span>{' '}
                          <span style={{ fontSize: '14px', color: 'var(--color-teal)' }}>{testDetail.result_unit}</span>
                        </>
                      ) : (
                        <span style={{ fontSize: '14px', color: 'var(--color-muted)' }}>Pending outcome reading</span>
                      )}
                    </div>
                  </div>

                  <div>
                    {testDetail.result_interpretation ? (
                      <span className={`badge ${getInterpretationBadge(testDetail.result_interpretation)}`} style={{ fontSize: '14px', padding: '6px 14px' }}>
                        {testDetail.result_interpretation}
                      </span>
                    ) : (
                      <span className={`badge ${getStatusBadge(testDetail.test_status)}`}>
                        {testDetail.test_status}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  padding: '14px',
                  backgroundColor: 'var(--color-background)',
                  borderRadius: 'var(--radius-control)',
                  fontSize: '12px',
                }}>
                  <div>
                    <div style={{ color: 'var(--color-muted)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>Specimen Identifier</div>
                    <div className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)', fontSize: '13px' }}>
                      <FlaskConical size={13} style={{ marginRight: '4px', verticalAlign: '-1px', color: 'var(--color-teal)' }} />
                      {testDetail.sample_code}
                    </div>
                    <div style={{ color: 'var(--color-ink)', marginTop: '2px' }}>{testDetail.sample_name}</div>
                    <div style={{ marginTop: '4px' }}>
                      <span className={`badge ${getSampleStatusBadge(testDetail.sample_status)} font-mono`} style={{ fontSize: '10px' }}>
                        {testDetail.sample_status}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--color-muted)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>Specimen Type & Location</div>
                    <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{testDetail.sample_type_name} ({testDetail.sample_type_code})</div>
                    <div className="font-mono" style={{ color: 'var(--color-teal)', marginTop: '2px' }}>
                      {testDetail.sample_storage_location || 'Unassigned coordinate'}
                    </div>
                    {testDetail.sample_remaining_quantity !== undefined && testDetail.sample_remaining_quantity !== null && (
                      <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
                        Current Stock: <strong className="font-mono">{testDetail.sample_remaining_quantity}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {testDetail.sample_quarantined_by_test && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-control)',
                    backgroundColor: '#FDEDEC',
                    border: '1px solid rgba(201, 79, 63, 0.4)',
                    color: 'var(--color-danger)',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <ShieldAlert size={18} />
                    <div>
                      <strong>Specimen Auto-Quarantined:</strong> This assay triggered an automatic quarantine event on specimen <strong>{testDetail.sample_code}</strong>.
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={14} color="var(--color-teal)" />
                    <div>
                      <div style={{ color: 'var(--color-muted)' }}>Requested Date</div>
                      <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
                        {testDetail.requested_at ? new Date(testDetail.requested_at).toLocaleString() : 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={14} color="var(--color-teal)" />
                    <div>
                      <div style={{ color: 'var(--color-muted)' }}>Performed Date</div>
                      <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
                        {testDetail.performed_at ? new Date(testDetail.performed_at).toLocaleString() : 'In execution'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={14} color="var(--color-teal)" />
                    <div>
                      <div style={{ color: 'var(--color-muted)' }}>Operator / Performer</div>
                      <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
                        {testDetail.performed_by_name || 'System Operator'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={14} color="var(--color-teal)" />
                    <div>
                      <div style={{ color: 'var(--color-muted)' }}>Lifecycle State</div>
                      <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{testDetail.test_status}</div>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--color-ink)', fontSize: '13px', marginBottom: '6px' }}>
                    Protocol Notes & Qualitative Observations
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--color-ink)',
                    lineHeight: 1.5,
                    backgroundColor: 'var(--color-background)',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-control)',
                  }}>
                    {testDetail.observation || 'No qualitative observation notes entered.'}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
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

      {/* ========================================================================= */}
      {/* Modal: Phase 2 Certificate of Analysis (CoA) & Study Release Dossier      */}
      {/* ========================================================================= */}
      {isCoAOpen && (
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
          <div className="card" style={{ maxWidth: '720px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--color-border)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Award size={26} color="var(--color-teal)" />
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Certificate of Quality Analysis & Study Release
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                    ISO 17025 Compliant Analytical Quality Clearance
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCoAOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {coALoading || !coADossier ? (
              <div style={{ textAlign: 'center', padding: '50px', color: 'var(--color-muted)' }}>
                <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                Synthesizing multi-assay quality release certificate...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Official Release Verdict Banner */}
                <div style={{
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-control)',
                  backgroundColor: coADossier.can_release ? 'var(--color-pale-teal)' : '#FDEDEC',
                  border: `1px solid ${coADossier.can_release ? 'rgba(40, 125, 120, 0.4)' : 'rgba(201, 79, 63, 0.4)'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: coADossier.can_release ? 'var(--color-teal)' : 'var(--color-danger)' }}>
                      Official Release Clearance Verdict
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-ink)', marginTop: '2px' }}>
                      {coADossier.clearance_status.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-ink)', marginTop: '4px' }}>
                      {coADossier.clearance_decision}
                    </div>
                  </div>

                  <div>
                    <span className={`badge ${coADossier.can_release ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '13px', padding: '6px 14px' }}>
                      {coADossier.can_release ? 'RELEASE APPROVED' : 'RELEASE BLOCKED'}
                    </span>
                  </div>
                </div>

                {/* Certificate Metadata Bar */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '10px',
                  backgroundColor: 'var(--color-background)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-control)',
                  fontSize: '11px',
                }}>
                  <div>
                    <span style={{ color: 'var(--color-muted)' }}>Certificate ID:</span>
                    <div className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{coADossier.certificate_id}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-muted)' }}>Certified Date:</span>
                    <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{new Date(coADossier.certified_at).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-muted)' }}>Specimen Code:</span>
                    <div className="font-mono" style={{ fontWeight: 700, color: 'var(--color-teal)' }}>{coADossier.sample_code}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-muted)' }}>Storage Location:</span>
                    <div className="font-mono" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{coADossier.storage_location || 'Unassigned'}</div>
                  </div>
                </div>

                {/* Score Summary Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  <div className="card" style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-muted)', textTransform: 'uppercase' }}>Total Assays</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-ink)' }}>{coADossier.total_tests_conducted}</div>
                  </div>
                  <div className="card" style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-success)', textTransform: 'uppercase' }}>Passed Assays</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-success)' }}>{coADossier.passed_tests_count}</div>
                  </div>
                  <div className="card" style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-warning)', textTransform: 'uppercase' }}>Borderline</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-warning)' }}>{coADossier.borderline_tests_count}</div>
                  </div>
                  <div className="card" style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-danger)', textTransform: 'uppercase' }}>Failed / Contam</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-danger)' }}>{coADossier.failed_tests_count}</div>
                  </div>
                </div>

                {/* Evaluated Assays Panel */}
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '8px' }}>
                    Evaluated Analytical Quality Assays
                  </h4>
                  <table className="table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Assay Protocol</th>
                        <th>Execution</th>
                        <th>Metric Value</th>
                        <th>QC Verdict</th>
                        <th>Tolerance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coADossier.evaluated_assays.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: 'var(--color-muted)' }}>
                            No tests recorded for this specimen.
                          </td>
                        </tr>
                      ) : (
                        coADossier.evaluated_assays.map((a) => (
                          <tr key={a.sample_test_id}>
                            <td style={{ fontWeight: 600 }}>{a.test_type}</td>
                            <td><span className={`badge ${getStatusBadge(a.test_status)}`}>{a.test_status}</span></td>
                            <td className="font-mono">
                              {a.result_value !== undefined && a.result_value !== null ? `${a.result_value.toFixed(2)} ${a.result_unit}` : '—'}
                            </td>
                            <td>
                              {a.result_interpretation ? (
                                <span className={`badge ${getInterpretationBadge(a.result_interpretation)}`}>
                                  {a.result_interpretation}
                                </span>
                              ) : '—'}
                            </td>
                            <td>
                              <span className={`badge ${a.tolerance_status === 'PASS' ? 'badge-success' : a.tolerance_status === 'FAIL' ? 'badge-danger' : 'badge-warning'}`}>
                                {a.tolerance_status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                    BioTrace Lab · ISO/IEC 17025 Certified Biological Testing Facility
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => window.print()}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Printer size={14} />
                      Print Certificate
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setIsCoAOpen(false)}
                    >
                      Close Certificate
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Phase 2 Statistical QC & Instrument Drift Monitoring               */}
      {/* ========================================================================= */}
      {isDriftOpen && (
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
          <div className="card" style={{ maxWidth: '800px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '26px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <TrendingUp size={24} color="var(--color-teal)" />
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)' }}>
                    Instrument Precision & Calibration Drift Analytics
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                    Statistical process control (SPC), Levey-Jennings monitoring, and Westgard rule tracking
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDriftOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {driftLoading ? (
              <div style={{ textAlign: 'center', padding: '50px', color: 'var(--color-muted)' }}>
                <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                Computing Levey-Jennings variance metrics and %CV...
              </div>
            ) : driftReports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                No completed numerical assay readings available for statistical analysis.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {driftReports.map((r, idx) => (
                  <div key={idx} className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)' }}>
                          {r.test_type}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                          Unit: <strong className="font-mono">{r.measurement_unit || 'N/A'}</strong> · Runs Recorded: <strong>{r.run_count}</strong>
                        </div>
                      </div>

                      <div>
                        <span className={`badge ${
                          r.control_status === 'STABLE' ? 'badge-success' :
                          r.control_status === 'MARGINAL' ? 'badge-warning' :
                          r.control_status === 'DRIFT_DETECTED' ? 'badge-danger' : 'badge-neutral'
                        }`} style={{ fontSize: '12px', padding: '4px 10px' }}>
                          {r.control_status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 1fr)',
                      gap: '8px',
                      backgroundColor: 'var(--color-background)',
                      padding: '12px',
                      borderRadius: 'var(--radius-control)',
                      fontSize: '11px',
                      textAlign: 'center',
                    }}>
                      <div>
                        <div style={{ color: 'var(--color-muted)' }}>Mean (μ)</div>
                        <div className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-ink)' }}>{r.mean_value.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--color-muted)' }}>Std Dev (σ)</div>
                        <div className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-ink)' }}>{r.std_deviation.toFixed(3)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--color-muted)' }}>%CV Precision</div>
                        <div className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: r.coeff_of_variation_pct < 5 ? 'var(--color-teal)' : 'var(--color-warning)' }}>
                          {r.coeff_of_variation_pct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--color-muted)' }}>Latest (z-score)</div>
                        <div className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-ink)' }}>
                          {r.latest_reading?.toFixed(2)} ({r.latest_z_score?.toFixed(1)}σ)
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--color-muted)' }}>Westgard Alarms</div>
                        <div className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: r.action_count_3sigma > 0 ? 'var(--color-danger)' : 'var(--color-teal)' }}>
                          {r.action_count_3sigma} (3σ) / {r.warning_count_2sigma} (2σ)
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Activity size={14} color="var(--color-teal)" />
                      <span>{r.recommended_action}</span>
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsDriftOpen(false)}
                  >
                    Close Analytics
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Modal: Phase 2 High-Throughput Batch Assay Scheduling                     */}
      {/* ========================================================================= */}
      {isBatchOpen && (
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
          <div className="card" style={{ maxWidth: '680px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '26px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={22} color="var(--color-teal)" />
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)' }}>
                    High-Throughput Batch Assay Scheduling (Strip / 96-Well)
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                    Schedule an identical analytical protocol across multiple biological specimens with automated inventory protection.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleBatchSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">Assay Protocol</label>
                  <select
                    className="input"
                    value={batchForm.test_type}
                    onChange={(e) => {
                      const preset = ASSAY_PRESETS.find((p) => p.name === e.target.value);
                      setBatchForm({
                        ...batchForm,
                        test_type: e.target.value,
                        result_unit: preset ? preset.unit : batchForm.result_unit,
                        quantity_consumed_per_sample: preset ? preset.defaultConsume : batchForm.quantity_consumed_per_sample,
                      });
                    }}
                  >
                    {ASSAY_PRESETS.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Batch Run Identifier</label>
                  <input
                    type="text"
                    className="input font-mono"
                    placeholder="e.g. RUN-20261029-OCTA-01"
                    value={batchForm.batch_run_identifier || ''}
                    onChange={(e) => setBatchForm({ ...batchForm, batch_run_identifier: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">Quantity Consumed Per Specimen</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className="input font-mono"
                    value={batchForm.quantity_consumed_per_sample !== undefined ? batchForm.quantity_consumed_per_sample : ''}
                    onChange={(e) =>
                      setBatchForm({
                        ...batchForm,
                        quantity_consumed_per_sample: e.target.value ? Number(e.target.value) : 0,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="label">Measurement Unit</label>
                  <input
                    type="text"
                    className="input font-mono"
                    value={batchForm.result_unit || ''}
                    onChange={(e) => setBatchForm({ ...batchForm, result_unit: e.target.value })}
                  />
                </div>
              </div>

              {/* Specimen Multi-Select Cohort */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="label" style={{ margin: 0 }}>
                    Select Cohort Specimens ({selectedBatchSamples.length} selected)
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      style={{ fontSize: '11px', background: 'none', border: 'none', color: 'var(--color-teal)', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() =>
                        setSelectedBatchSamples(
                          samplesList
                            .filter((s) => s.sample_status !== 'DISPOSED' && s.sample_status !== 'MISSING')
                            .slice(0, 16)
                            .map((s) => s.sample_id)
                        )
                      }
                    >
                      Select Active 16
                    </button>
                    <button
                      type="button"
                      style={{ fontSize: '11px', background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer' }}
                      onClick={() => setSelectedBatchSamples([])}
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-control)',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  backgroundColor: 'var(--color-background)',
                }}>
                  {samplesList.map((s) => {
                    const isChecked = selectedBatchSamples.includes(s.sample_id);
                    const isInactive = s.sample_status === 'DISPOSED' || s.sample_status === 'MISSING';
                    return (
                      <label
                        key={s.sample_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          backgroundColor: isChecked ? 'var(--color-pale-teal)' : undefined,
                          cursor: isInactive ? 'not-allowed' : 'pointer',
                          opacity: isInactive ? 0.5 : 1,
                          fontSize: '12px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isInactive}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBatchSamples((prev) => [...prev, s.sample_id]);
                            } else {
                              setSelectedBatchSamples((prev) => prev.filter((id) => id !== s.sample_id));
                            }
                          }}
                        />
                        <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                          {s.sample_code}
                        </span>
                        <span style={{ color: 'var(--color-ink)', flex: 1 }}>{s.sample_name}</span>
                        <span className={`badge ${getSampleStatusBadge(s.sample_status)} font-mono`} style={{ fontSize: '9px' }}>
                          {s.sample_status}
                        </span>
                        <span className="font-mono" style={{ color: 'var(--color-muted)', fontSize: '11px' }}>
                          {s.quantity_value} {s.quantity_unit}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Batch Results Feedback */}
              {batchResult && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-control)',
                  backgroundColor: batchResult.scheduled_count > 0 ? 'var(--color-pale-teal)' : '#FDEDEC',
                  border: `1px solid ${batchResult.scheduled_count > 0 ? 'rgba(40, 125, 120, 0.3)' : 'rgba(201, 79, 63, 0.3)'}`,
                  fontSize: '12px',
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--color-ink)', marginBottom: '4px' }}>
                    Batch Execution Summary: {batchResult.scheduled_count} Scheduled · {batchResult.skipped_count} Skipped
                  </div>
                  {batchResult.skipped_samples.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      {batchResult.skipped_samples.map((sk, i) => (
                        <div key={i} style={{ color: 'var(--color-danger)', fontSize: '11px' }}>
                          • <strong>{sk.sample_code}</strong>: {sk.reason} [{sk.error_code}]
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsBatchOpen(false)}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={batchSubmitting || selectedBatchSamples.length === 0}
                >
                  {batchSubmitting ? 'Scheduling Batch...' : `Execute Batch (${selectedBatchSamples.length} Samples)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
