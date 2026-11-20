import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { analyticsService } from './analyticsService';
import {
  OverviewKpiData,
  WorkflowPulseData,
  IntegrityScanData,
  OperationalStatusData,
  DatabaseInsightData,
  ActivityFeedItem,
} from './types';
import { OperationalBanner } from './components/OperationalBanner';
import { QuickActionsBar } from './components/QuickActionsBar';
import { KpiRibbon } from './components/KpiRibbon';
import { WorkflowPulse } from './components/WorkflowPulse';
import { ActivityTimeline } from './components/ActivityTimeline';
import { DatabaseInsightModal } from './components/DatabaseInsightModal';
import { MolecularHelixObservatory } from './components/MolecularHelixObservatory';
import {
  FlaskConical,
  GitFork,
  CheckCircle2,
  TestTubes,
  FileText,
  AlertTriangle,
  Scroll,
  BrainCircuit,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface OverviewDashboardProps {
  onOpenSample: (id: number) => void;
  onSelectSection: (section: string) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ onSelectSection, onOpenSample }) => {
  const { user } = useAuth();

  // State
  const [kpis, setKpis] = useState<OverviewKpiData | null>(null);
  const [pulse, setPulse] = useState<WorkflowPulseData | null>(null);
  const [scanData, setScanData] = useState<IntegrityScanData | null>(null);
  const [opStatus, setOpStatus] = useState<OperationalStatusData | null>(null);
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [showHelix, setShowHelix] = useState(false);
  const [isSubsystemsExpanded, setIsSubsystemsExpanded] = useState(false);

  // Loading flags
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Database insight modal state
  const [isInsightOpen, setIsInsightOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<DatabaseInsightData | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  // Fetch all Overview data
  const loadOverviewData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setIsLoading(true);
    setErrorMessage(null);

    try {
      const [kpiRes, pulseRes, opRes, feedRes] = await Promise.all([
        analyticsService.getOverviewKpis(),
        analyticsService.getWorkflowPulse(),
        analyticsService.getOperationalStatus(),
        analyticsService.getActivityFeed(25),
      ]);

      setKpis(kpiRes);
      setPulse(pulseRes);
      setOpStatus(opRes);
      setActivities(feedRes);

      // Trigger initial integrity scan if not yet loaded
      if (!scanData) {
        try {
          const scanRes = await analyticsService.runIntegrityScan();
          setScanData(scanRes);
        } catch (scanErr) {
          console.warn('Initial integrity scan deferred:', scanErr);
        }
      }
    } catch (err: any) {
      console.error('Failed to load Overview telemetry:', err);
      setErrorMessage(err?.message || 'Failed to retrieve real-time laboratory telemetry.');
    } finally {
      setIsLoading(false);
    }
  }, [scanData]);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  // Execute on-demand Data Quality Integrity Scan
  const handleRunScan = async () => {
    setIsScanning(true);
    try {
      const scanRes = await analyticsService.runIntegrityScan();
      setScanData(scanRes);
      // Refresh operational status to update last scan time
      const opRes = await analyticsService.getOperationalStatus();
      setOpStatus(opRes);
      // Refresh activities to show the scan audit record
      const feedRes = await analyticsService.getActivityFeed(25);
      setActivities(feedRes);
    } catch (err: any) {
      console.error('Failed to execute integrity scan:', err);
      setErrorMessage(err?.message || 'Failed to execute database integrity scan.');
    } finally {
      setIsScanning(false);
    }
  };

  // Open Educational DBMS Insight Modal
  const handleOpenInsight = async (metricKey: string) => {
    setIsInsightOpen(true);
    setIsInsightLoading(true);
    try {
      const data = await analyticsService.getDatabaseInsight(metricKey);
      setSelectedInsight(data);
    } catch (err: any) {
      console.error('Failed to load database insight:', err);
    } finally {
      setIsInsightLoading(false);
    }
  };

  const handleCloseInsight = () => {
    setIsInsightOpen(false);
    setSelectedInsight(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
      {/* 1. Verified Operational Database Status Banner (Feature Seven) */}
      <OperationalBanner
        user={user ? { display_name: user.display_name, role: user.role, email: user.email } : undefined}
        operationalStatus={opStatus}
        isLoading={isLoading}
        onRefresh={() => loadOverviewData(true)}
      />

      {/* Error alert if backend unreachable */}
      {errorMessage && (
        <div
          className="card"
          style={{
            padding: '16px',
            marginBottom: '24px',
            borderLeft: '4px solid var(--color-danger)',
            backgroundColor: '#FDF2F2',
          }}
        >
          <div style={{ fontSize: '13px', color: '#B91C1C', fontWeight: 600 }}>
            {errorMessage}
          </div>
        </div>
      )}

      {/* Contextual Quick Actions Toolbar */}
      <QuickActionsBar
        userRole={user?.role}
        isScanning={isScanning}
        onNavigateSection={onSelectSection}
        onRunScan={handleRunScan}
      />

      <section className="card overview-cohort-link">
        <div><h2>Cohort Review</h2><p className="lab-muted">Check why a specimen made the assay cohort or missed it.</p></div>
        <button className="btn-primary" type="button" onClick={() => onSelectSection('cohort')}>Review specimens</button>
      </section>

      <details className="optional-tools" onToggle={event => setShowHelix(event.currentTarget.open)}>
        <summary>Specimen helix</summary>
        {showHelix && <MolecularHelixObservatory totalSamples={kpis?.total_samples} onOpenSample={onOpenSample} />}
      </details>

      {/* 3. Laboratory Operations KPI Command Centre (Feature One) */}
      <KpiRibbon
        kpis={kpis}
        isLoading={isLoading}
        onNavigateSection={onSelectSection}
        onOpenInsight={handleOpenInsight}
      />

      {/* 4. Interactive Laboratory Workflow Pulse (Feature Two) */}
      <WorkflowPulse
        pulse={pulse}
        isLoading={isLoading}
        onNavigateSection={onSelectSection}
        onOpenInsight={handleOpenInsight}
      />

      {/* 6. Laboratory Activity and Audit Timeline (Feature Four) */}
      <ActivityTimeline
        activities={activities}
        isLoading={isLoading}
        onNavigateSection={onSelectSection}
      />

      {/* 7. Preserved Module Capabilities Guide Grid */}
      <div style={{ marginTop: '12px', marginBottom: '24px' }}>
        <div
          className="card"
          style={{
            padding: '12px 18px',
            backgroundColor: 'var(--color-surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            cursor: 'pointer',
          }}
          onClick={() => setIsSubsystemsExpanded(!isSubsystemsExpanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="badge badge-success">10 Modules Online</span>
            <span style={{ fontSize: '13px', color: 'var(--color-ink)', fontWeight: 600 }}>
              Specialized Laboratory Subsystems & Workspaces
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-teal)', fontWeight: 600 }}>
              {isSubsystemsExpanded ? 'Collapse Subsystems ↑' : 'Show All 10 Module Cards ↓'}
            </span>
            {isSubsystemsExpanded ? <ChevronUp size={15} color="var(--color-teal)" /> : <ChevronDown size={15} color="var(--color-teal)" />}
          </div>
        </div>

        {isSubsystemsExpanded && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginTop: '12px' }}>
          {/* Card: Samples */}
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--color-background)' }}
            onClick={() => onSelectSection('samples')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <FlaskConical size={16} color="var(--color-teal)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>Sample Registry</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
              Accession catalog, atomic sub-sample aliquot derivation with remaining parent stock deduction.
            </p>
          </div>

          {/* Card: Lineage */}
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--color-background)' }}
            onClick={() => onSelectSection('lineage')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <GitFork size={16} color="var(--color-teal)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>Lineage DAG Explorer</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
              Directed acyclic graph canvas with recursive SQL CTE ancestry/descendant generation tracking.
            </p>
          </div>

          {/* Card: Tests */}
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--color-background)' }}
            onClick={() => onSelectSection('tests')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <CheckCircle2 size={16} color="var(--color-teal)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>Quality Assays</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
              Fluorometric concentration, electrophoretic fragment size, and qPCR bacterial screening thresholds.
            </p>
          </div>

          {/* Card: Experiments */}
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--color-background)' }}
            onClick={() => onSelectSection('experiments')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <TestTubes size={16} color="var(--color-teal)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>Experiments & Cohorts</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
              Multi-specimen cohort assembly, laboratory instrument reservations, and protocol tracking.
            </p>
          </div>

          {/* Card: Results */}
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--color-background)' }}
            onClick={() => onSelectSection('results')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <FileText size={16} color="var(--color-teal)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>Results Registry</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
              Quantitative analytical findings with peer-verification locking and scientific immutability.
            </p>
          </div>

          {/* Card: Incidents */}
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--color-background)' }}
            onClick={() => onSelectSection('incidents')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <AlertTriangle size={16} color="var(--color-danger)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>Incidents & Blast Radius</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
              Cascading sample quarantine and recursive lineage blast radius calculation.
            </p>
          </div>

          {/* Card: Ancient */}
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--color-background)' }}
            onClick={() => onSelectSection('ancient')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Scroll size={16} color="var(--color-teal)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>Ancient Provenance</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
              Archaeological site survey context, calibrated BP chronometrics, and excavation stratigraphy.
            </p>
          </div>

          {/* Card: AI Risk */}
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--color-background)' }}
            onClick={() => onSelectSection('ai_analysis')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <BrainCircuit size={16} color="var(--color-teal)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>AI Risk Advisory</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
              Evidence-based handling priorities, human review, and a separate synthetic-data Random Forest experiment.
            </p>
          </div>

          {/* Card: Reports */}
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', backgroundColor: 'var(--color-background)' }}
            onClick={() => onSelectSection('reports')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <BarChart3 size={16} color="var(--color-teal)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>Reports & Analytics</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-muted)', margin: 0, lineHeight: 1.4 }}>
              Deep distribution breakdown by biological classification, storage unit occupancy, and JSON export.
            </p>
          </div>
        </div>
      )}
    </div>

      {/* 8. Interactive Database Educational Insight Modal (Feature Five) */}
      {isInsightOpen && (
        <DatabaseInsightModal
          insight={selectedInsight}
          isLoading={isInsightLoading}
          onClose={handleCloseInsight}
        />
      )}
    </div>
  );
};
