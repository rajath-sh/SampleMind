import { SummaryReport, type ReportDocument } from './SummaryReport';
import { DatabaseConcept } from '../../components/DatabaseConcept';
import { CompactTable } from '../../components/CompactTable';
// import { AIRiskAdvisoryPage } from '../ai/AIRiskAdvisoryPage';
import React, { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical,
  Warehouse,
  TestTubes,
  CheckCircle2,
  AlertTriangle,
  BrainCircuit,
  RefreshCw,
  Download,
  Clock,
  Activity,
} from 'lucide-react';
import { analyticsService } from './analyticsService';
import {
  DashboardMetrics,
  SampleTypeDistribution,
  StorageOccupancyItem,
  IncidentTrendItem,
  ExperimentOutcomeReport,
  ActivityFeedItem,
} from './types';

export const ReportsAnalyticsPage: React.FC<{ 
  onSendToAI: (report: ReportDocument) => void;
  initialTab?: 'inventory' | 'storage' | 'incidents' | 'experiments' | 'audit' | 'risk';
}> = ({ onSendToAI, initialTab = 'inventory' }) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'storage' | 'incidents' | 'experiments' | 'audit' | 'risk'>(initialTab);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [sampleTypes, setSampleTypes] = useState<SampleTypeDistribution[]>([]);
  const [storageOccupancy, setStorageOccupancy] = useState<StorageOccupancyItem[]>([]);
  const [incidentTrends, setIncidentTrends] = useState<IncidentTrendItem[]>([]);
  const [experimentOutcomes, setExperimentOutcomes] = useState<ExperimentOutcomeReport[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);

  const loadAllData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const [
        dashMetrics,
        samplesData,
        storageData,
        incidentsData,
        experimentsData,
        feedData,
      ] = await Promise.all([
        analyticsService.getDashboardMetrics(),
        analyticsService.getSamplesByType(),
        analyticsService.getStorageOccupancy(),
        analyticsService.getIncidentTrends(),
        analyticsService.getExperimentOutcomes(),
        analyticsService.getActivityFeed(25),
      ]);

      setMetrics(dashMetrics);
      setSampleTypes(samplesData);
      setStorageOccupancy(storageData);
      setIncidentTrends(incidentsData);
      setExperimentOutcomes(experimentsData);
      setActivityFeed(feedData);
    } catch (err: any) {
      console.error('Failed to load lab analytics:', err);
      setError(err?.message || 'Failed to fetch lab analytics from BioTrace core engine.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Export full analytics summary as JSON
  const handleExportJSON = () => {
    const exportPayload = {
      institution: 'RV College of Engineering® (RVCE), Bangalore',
      department: 'Computer Science & Engineering (Data Science) CD-2',
      lab: 'DBMS Laboratory Part-B Final Project Evaluation',
      authors: [
        { name: 'Rajath V Shanbhogue', usn: '1RV24CD039' },
        { name: 'Siddhanth K Jain', usn: '1RV24CD051' },
        { name: 'Vishwas Y K', usn: '1RV24CD061' },
      ],
      exported_at: new Date().toISOString(),
      dashboard_metrics: metrics,
      samples_by_type: sampleTypes,
      storage_occupancy: storageOccupancy,
      incident_trends: incidentTrends,
      experiment_outcomes: experimentOutcomes,
      recent_audit_activities: activityFeed,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SampleMind_Lab_Analytics_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getPassRate = () => {
    if (!metrics || metrics.total_tests === 0) return 0;
    return Math.round((metrics.tests_passed / metrics.total_tests) * 100);
  };

  if (isLoading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          backgroundColor: 'var(--color-pale-teal)',
          color: 'var(--color-teal)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}>
          <Activity size={24} className="animate-spin" />
        </div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-ink)' }}>
          Aggregating BioTrace Lab Subsystem Analytics...
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>
          Querying biological inventory, storage occupancy, incident frequencies, and audit logs
        </div>
      </div>
    );
  }

  return (
    <div>
      <SummaryReport onSendToAI={onSendToAI} />
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="badge badge-success">Executive Analytics Engine</span>
            <span className="badge badge-sand">DBMS Lab CD-2 Evaluated</span>
            <span className="badge badge-neutral font-mono">Module 10</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '4px' }}>
            Laboratory Overview, Reports & Analytics
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', maxWidth: '780px' }}>
            Multi-dimensional operational telemetry across biological specimen cataloging, cryogenic storage occupancy, research cohorts, quality assays, and safety incident trends.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => loadAllData(true)}
            disabled={isRefreshing}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Metrics'}
          </button>

          <button
            type="button"
            onClick={handleExportJSON}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Download size={15} />
            Export Comprehensive Report
          </button>
        </div>
      </div>

      {/* Error state alert */}
      {error && (
        <div className="card" style={{ padding: '16px', marginBottom: '24px', borderLeft: '4px solid var(--color-danger)', backgroundColor: '#FDF2F2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="var(--color-danger)" />
            <div style={{ fontSize: '13px', color: '#B91C1C', fontWeight: 500 }}>
              {error}
            </div>
            <button
              type="button"
              onClick={() => loadAllData()}
              className="btn btn-secondary"
              style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 10px' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* RVCE Academic Attribution & Lab Metadata Pill Banner */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '24px', backgroundColor: 'var(--color-surface)', borderLeft: '4px solid var(--color-teal)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
              Academic Laboratory Evaluation Baseline
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', marginTop: '2px' }}>
              RV College of Engineering® • Dept of CSE (Data Science) CD-2 • DBMS Lab Part-B
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
              Rajath V Shanbhogue (<span className="font-mono">1RV24CD039</span>) • Siddhanth K Jain (<span className="font-mono">1RV24CD051</span>) • Vishwas Y K (<span className="font-mono">1RV24CD061</span>)
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: 'var(--color-pale-teal)', fontSize: '12px', color: 'var(--color-teal)', fontWeight: 600 }}>
              15 Database Relations Online
            </div>
            <div style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', fontSize: '12px', color: 'var(--color-ink)', fontWeight: 600 }}>
              MySQL 8.0 Relational Engine Active
            </div>
          </div>
        </div>
      </div>

      {/* 6 Hero KPI Metric Cards Grid */}
      {metrics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          {/* Card 1: Biological Samples */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                Inventory Samples
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <FlaskConical size={18} />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1 }}>
              {metrics.total_samples}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '12px', color: 'var(--color-muted)' }}>
              <span className="badge badge-success" style={{ padding: '2px 6px', fontSize: '11px' }}>
                {metrics.active_samples} Active
              </span>
              <span>•</span>
              <span style={{ color: metrics.quarantined_samples > 0 ? 'var(--color-danger)' : 'var(--color-muted)' }}>
                {metrics.quarantined_samples} Quarantined
              </span>
            </div>
          </div>

          {/* Card 2: Storage Occupancy */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                Storage Occupancy
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <Warehouse size={18} />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1 }}>
              {metrics.storage_occupancy_percent}%
            </div>
            <div style={{ marginTop: '10px' }}>
              <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(metrics.storage_occupancy_percent, 100)}%`,
                  height: '100%',
                  backgroundColor: metrics.storage_occupancy_percent > 85 ? 'var(--color-danger)' : 'var(--color-teal)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
                <span>{metrics.occupied_storage_locations} occupied</span>
                <span>{metrics.total_storage_locations} slots total</span>
              </div>
            </div>
          </div>

          {/* Card 3: Research Experiments */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                Research Cohorts
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <TestTubes size={18} />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1 }}>
              {metrics.total_experiments}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '12px', color: 'var(--color-muted)' }}>
              <span className="badge badge-success" style={{ padding: '2px 6px', fontSize: '11px' }}>
                {metrics.active_experiments} In Execution
              </span>
              <span>•</span>
              <span>{metrics.equipment_in_use} Instruments in use</span>
            </div>
          </div>

          {/* Card 4: Quality Assays */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                Assays & QC Rate
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1 }}>
              {getPassRate()}%
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '12px', color: 'var(--color-muted)' }}>
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                {metrics.tests_passed} Passed
              </span>
              <span>•</span>
              <span style={{ color: metrics.tests_failed > 0 ? 'var(--color-danger)' : 'var(--color-muted)' }}>
                {metrics.tests_failed} Failed
              </span>
              <span>•</span>
              <span>{metrics.total_tests} Runs</span>
            </div>
          </div>

          {/* Card 5: Incidents & Safety */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                Open Incidents
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: metrics.open_incidents > 0 ? '#FDF2F2' : 'var(--color-pale-teal)', color: metrics.open_incidents > 0 ? '#B91C1C' : 'var(--color-teal)' }}>
                <AlertTriangle size={18} />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: '28px', fontWeight: 700, color: metrics.open_incidents > 0 ? '#B91C1C' : 'var(--color-ink)', lineHeight: 1 }}>
              {metrics.open_incidents}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '12px', color: 'var(--color-muted)' }}>
              {metrics.critical_incidents > 0 ? (
                <span className="badge badge-danger" style={{ padding: '2px 6px', fontSize: '11px' }}>
                  {metrics.critical_incidents} CRITICAL
                </span>
              ) : (
                <span className="badge badge-success" style={{ padding: '2px 6px', fontSize: '11px' }}>
                  0 Critical
                </span>
              )}
              <span>•</span>
              <span>Requires CAPA</span>
            </div>
          </div>

          {/* Card 6: AI Risk Advisory */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                AI Risk Advisories
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <BrainCircuit size={18} />
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1 }}>
              {metrics.high_risk_ai_predictions}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '12px', color: 'var(--color-muted)' }}>
              <span className="badge badge-sand" style={{ padding: '2px 6px', fontSize: '11px' }}>
                HIGH Risk Flags
              </span>
              <span>•</span>
              <span>{metrics.pending_ai_reviews} Pending Review</span>
            </div>
          </div>
        </div>
      )}

      {/* Reports Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: '24px',
        overflowX: 'auto',
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          style={{
            padding: '12px 18px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: activeTab === 'inventory' ? 600 : 500,
            color: activeTab === 'inventory' ? 'var(--color-teal)' : 'var(--color-muted)',
            borderBottom: activeTab === 'inventory' ? '2px solid var(--color-teal)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FlaskConical size={16} />
          Biological Inventory Breakdown ({sampleTypes.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('storage')}
          style={{
            padding: '12px 18px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: activeTab === 'storage' ? 600 : 500,
            color: activeTab === 'storage' ? 'var(--color-teal)' : 'var(--color-muted)',
            borderBottom: activeTab === 'storage' ? '2px solid var(--color-teal)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Warehouse size={16} />
          Storage Infrastructure ({storageOccupancy.length} Units)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('incidents')}
          style={{
            padding: '12px 18px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: activeTab === 'incidents' ? 600 : 500,
            color: activeTab === 'incidents' ? 'var(--color-teal)' : 'var(--color-muted)',
            borderBottom: activeTab === 'incidents' ? '2px solid var(--color-teal)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={16} />
          Safety & Incident Trends
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('experiments')}
          style={{
            padding: '12px 18px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: activeTab === 'experiments' ? 600 : 500,
            color: activeTab === 'experiments' ? 'var(--color-teal)' : 'var(--color-muted)',
            borderBottom: activeTab === 'experiments' ? '2px solid var(--color-teal)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <TestTubes size={16} />
          Research Outcomes ({experimentOutcomes.length} Statuses)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '12px 18px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: activeTab === 'audit' ? 600 : 500,
            color: activeTab === 'audit' ? 'var(--color-teal)' : 'var(--color-muted)',
            borderBottom: activeTab === 'audit' ? '2px solid var(--color-teal)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Clock size={16} />
          Audit Trail Activity Feed ({activityFeed.length})
        </button>

        {/* Risk Analysis subtab hidden for live-evaluation clarity (code preserved below):
        <button
          type="button"
          onClick={() => setActiveTab('risk')}
          style={{
            padding: '12px 18px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: activeTab === 'risk' ? 600 : 500,
            color: activeTab === 'risk' ? 'var(--color-teal)' : 'var(--color-muted)',
            borderBottom: activeTab === 'risk' ? '2px solid var(--color-teal)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <BrainCircuit size={16} />
          Risk Analysis & Predictions
        </button>
        */}
      </div>

      {/* TAB CONTENT 1: Inventory Breakdown */}
      {activeTab === 'inventory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Specimen Distribution by Biological Classification
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
                  Quantity aggregation and proportion shares across cataloged material types.
                </p>
              </div>
              <span className="badge badge-neutral font-mono">
                {sampleTypes.reduce((acc, t) => acc + t.sample_count, 0)} Total Specimen Records
              </span>
            </div>

            {/* Visual Bar Breakdown */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', gap: '2px', backgroundColor: 'var(--color-border)' }}>
                {sampleTypes.map((t, idx) => {
                  const colors = ['#287D78', '#203B4A', '#E9E1D2', '#687A83', '#5E9CAE', '#8CB369', '#D4A373'];
                  const color = colors[idx % colors.length];
                  return (
                    <div
                      key={t.type_code}
                      title={`${t.type_name}: ${t.percentage_of_total}%`}
                      style={{
                        width: `${Math.max(t.percentage_of_total, 2)}%`,
                        height: '100%',
                        backgroundColor: color,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Detailed Table */}
            <div style={{ overflowX: 'auto' }}>
              <CompactTable label="sample type report" extra={[4, 6]} help={<DatabaseConcept topic="reports" />}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Type Code</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Classification Name</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Specimen Count</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Total Quantity Stock</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Inventory Share %</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, width: '180px' }}>Relative Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleTypes.map((st) => (
                    <tr key={st.type_code} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px' }}>
                        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-teal)' }}>
                          {st.type_code}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 600, color: 'var(--color-ink)' }}>
                        {st.type_name}
                      </td>
                      <td className="font-mono" style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                        {st.sample_count}
                      </td>
                      <td className="font-mono" style={{ padding: '12px', textAlign: 'right' }}>
                        {st.total_quantity.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                      </td>
                      <td className="font-mono" style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                        {st.percentage_of_total.toFixed(1)}%
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--color-background)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${st.percentage_of_total}%`,
                            height: '100%',
                            backgroundColor: 'var(--color-teal)',
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </CompactTable>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: Storage Infrastructure */}
      {activeTab === 'storage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Storage Facility Occupancy & Unit Allocations
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
                  Cryogenic freezer racks, liquid nitrogen dewar tanks, and climate-controlled cabinets.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {storageOccupancy.map((u, i) => {
                const isHigh = u.occupancy_percentage > 80;
                const isMedium = u.occupancy_percentage > 50 && u.occupancy_percentage <= 80;
                return (
                  <div key={i} className="card" style={{ padding: '18px', backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '11px' }}>
                        {u.unit_type}
                      </span>
                      <span className={`badge ${isHigh ? 'badge-danger' : isMedium ? 'badge-warning' : 'badge-success'}`}>
                        {u.occupancy_percentage.toFixed(1)}% Full
                      </span>
                    </div>

                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '4px' }}>
                      {u.facility}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '14px' }}>
                      Unit Type: <strong>{u.unit_type}</strong>
                    </div>

                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
                      <div style={{
                        width: `${Math.min(u.occupancy_percentage, 100)}%`,
                        height: '100%',
                        backgroundColor: isHigh ? 'var(--color-danger)' : isMedium ? 'var(--color-warning)' : 'var(--color-teal)',
                      }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--color-ink)', fontWeight: 600 }}>
                        {u.occupied_locations} Occupied
                      </span>
                      <span style={{ color: 'var(--color-muted)' }}>
                        {u.available_locations} Available / {u.total_locations} Total
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: Incidents & Safety Trends */}
      {activeTab === 'incidents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Laboratory Incident Severity Breakdown & Resolution Status
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
                  Safety breach incidents, temperature excursions, and mechanical deviations.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {incidentTrends.map((t) => {
                const isCrit = t.severity === 'critical';
                const isHigh = t.severity === 'high';
                const isMed = t.severity === 'medium';
                return (
                  <div key={t.severity} className="card" style={{
                    padding: '18px',
                    borderLeft: `4px solid ${isCrit ? '#B91C1C' : isHigh ? '#B54747' : isMed ? '#B7791F' : 'var(--color-teal)'}`,
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                      {t.severity} Severity
                    </div>
                    <div className="font-mono" style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-ink)', marginTop: '4px' }}>
                      {t.count}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '8px' }}>
                      {t.percentage.toFixed(1)}% of all incidents
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', fontSize: '11px' }}>
                      <span className="badge badge-danger">
                        {t.open_count} Open
                      </span>
                      <span className="badge badge-success">
                        {t.resolved_count} Resolved
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: Research Outcomes */}
      {activeTab === 'experiments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Experimental Protocol Runs & Results Finalization
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
                  Cohort execution statuses, analytical measurements, and peer verification sign-offs.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <CompactTable label="experiment outcomes" extra={[]} help={<DatabaseConcept topic="reports" />}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Execution Status</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Experiments Count</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Total Results Recorded</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Finalized & Locked Results</th>
                  </tr>
                </thead>
                <tbody>
                  {experimentOutcomes.map((exp) => (
                    <tr key={exp.status} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px' }}>
                        <span className={`badge ${exp.status === 'completed' ? 'badge-success' : exp.status === 'active' ? 'badge-sand' : 'badge-neutral'}`} style={{ textTransform: 'uppercase' }}>
                          {exp.status}
                        </span>
                      </td>
                      <td className="font-mono" style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                        {exp.count}
                      </td>
                      <td className="font-mono" style={{ padding: '12px', textAlign: 'right' }}>
                        {exp.results_count}
                      </td>
                      <td className="font-mono" style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-success)' }}>
                        {exp.finalized_results_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </CompactTable>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: Audit Activity Feed */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Immutable Audit Log Activity Feed
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
                  Chronological event trail tracking user actions, mutations, and laboratory events.
                </p>
              </div>
              <span className="badge badge-success">
                System Active
              </span>
            </div>

            {activityFeed.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
                No audit trail logs recorded yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activityFeed.map((act) => (
                  <div key={act.audit_log_id} style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-control)',
                    backgroundColor: 'var(--color-background)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--color-pale-teal)',
                        color: 'var(--color-teal)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Activity size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>
                          {act.action}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>Entity: <strong>{act.entity_type}</strong></span>
                          {act.entity_id && (
                            <span className="font-mono" style={{ color: 'var(--color-teal)' }}>
                              #{act.entity_id}
                            </span>
                          )}
                          <span>•</span>
                          <span>Actor: <strong>{act.actor_name}</strong></span>
                          {act.actor_role && (
                            <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '1px 5px' }}>
                              {act.actor_role}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                      <span className="font-mono">
                        {new Date(act.occurred_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Subtab 6: AI Risk Analysis & Advisory - hidden for live-evaluation clarity (code preserved):
      {activeTab === 'risk' && (
        <div style={{ marginTop: '16px' }}>
          <AIRiskAdvisoryPage />
        </div>
      )}
      */}
    </div>
  );
};
