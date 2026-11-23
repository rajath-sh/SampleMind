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

      {/* BioTrace Specimen DNA Helix Observatory - Shown Always */}
      <MolecularHelixObservatory
        totalSamples={kpis?.total_samples}
        onOpenSample={onOpenSample}
      />

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
