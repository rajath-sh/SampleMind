import React from 'react';
import {
  FlaskConical,
  Warehouse,
  TestTubes,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Info,
} from 'lucide-react';
import { OverviewKpiData } from '../types';

interface KpiRibbonProps {
  kpis: OverviewKpiData | null;
  isLoading: boolean;
  onNavigateSection: (section: string) => void;
  onOpenInsight: (metricKey: string) => void;
}

export const KpiRibbon: React.FC<KpiRibbonProps> = ({
  kpis,
  isLoading,
  onNavigateSection,
  onOpenInsight,
}) => {
  if (isLoading || !kpis) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="card" style={{ padding: '20px', minHeight: '130px', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
            Loading telemetry...
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Real-Time Operational Indicators ({kpis.calculation_period})
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
          Last refreshed: <span className="font-mono">{new Date(kpis.last_refreshed_at).toLocaleTimeString()}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        {/* Card 1: Biological Specimens */}
        <div
          className="card"
          style={{ padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }}
          onClick={() => onNavigateSection('samples')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
              Biological Specimens
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInsight('active_samples');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '2px' }}
                title="Inspect SQL Query & Algebra"
              >
                <Info size={14} />
              </button>
              <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <FlaskConical size={16} />
              </div>
            </div>
          </div>
          <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>
            {kpis.total_samples.toLocaleString()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '11.5px', color: 'var(--color-muted)' }}>
            <span className="badge badge-success" style={{ padding: '1px 6px', fontSize: '10.5px' }}>
              {kpis.active_samples} Active
            </span>
            <span>•</span>
            <span style={{ color: kpis.quarantined_samples > 0 ? 'var(--color-danger)' : 'var(--color-muted)', fontWeight: kpis.quarantined_samples > 0 ? 600 : 400 }}>
              {kpis.quarantined_samples} Quarantined
            </span>
          </div>
        </div>

        {/* Card 2: Cryogenic Storage Occupancy */}
        <div
          className="card"
          style={{ padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }}
          onClick={() => onNavigateSection('storage')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
              Storage Occupancy
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInsight('storage_occupancy');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '2px' }}
                title="Inspect SQL Query & Algebra"
              >
                <Info size={14} />
              </button>
              <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <Warehouse size={16} />
              </div>
            </div>
          </div>
          <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>
            {kpis.storage_occupancy_percent.toFixed(1)}%
          </div>
          <div style={{ marginTop: '8px' }}>
            <div style={{ width: '100%', height: '5px', backgroundColor: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(kpis.storage_occupancy_percent, 100)}%`,
                  height: '100%',
                  backgroundColor: kpis.storage_occupancy_percent > 85 ? 'var(--color-danger)' : 'var(--color-teal)',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--color-muted)', marginTop: '3px' }}>
              <span>{kpis.occupied_storage_locations} occupied</span>
              <span>{kpis.total_storage_locations} slots total</span>
            </div>
          </div>
        </div>

        {/* Card 3: Research Cohorts */}
        <div
          className="card"
          style={{ padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }}
          onClick={() => onNavigateSection('experiments')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
              Research Cohorts
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <TestTubes size={16} />
              </div>
            </div>
          </div>
          <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>
            {kpis.total_experiments}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '11.5px', color: 'var(--color-muted)' }}>
            <span className="badge badge-teal" style={{ padding: '1px 6px', fontSize: '10.5px' }}>
              {kpis.active_experiments} In Execution
            </span>
            <span>•</span>
            <span>{kpis.equipment_in_use} Instruments in use</span>
          </div>
        </div>

        {/* Card 4: QC Assays Pass Rate */}
        <div
          className="card"
          style={{ padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }}
          onClick={() => onNavigateSection('tests')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
              Assay QC Pass Rate
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInsight('assay_qc_rate');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '2px' }}
                title="Inspect SQL Query & Algebra"
              >
                <Info size={14} />
              </button>
              <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <CheckCircle2 size={16} />
              </div>
            </div>
          </div>
          <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>
            {kpis.qc_pass_rate_percent.toFixed(1)}%
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '11.5px', color: 'var(--color-muted)' }}>
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{kpis.tests_passed} Passed</span>
            <span>•</span>
            <span style={{ color: kpis.tests_failed > 0 ? 'var(--color-danger)' : 'var(--color-muted)' }}>{kpis.tests_failed} Failed</span>
            <span>•</span>
            <span>{kpis.total_tests} Runs</span>
          </div>
        </div>

        {/* Card 5: Open Incidents & Safety */}
        <div
          className="card"
          style={{ padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }}
          onClick={() => onNavigateSection('incidents')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
              Open Incidents
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInsight('quarantine_compliance');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '2px' }}
                title="Inspect SQL Query & Algebra"
              >
                <Info size={14} />
              </button>
              <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: kpis.open_incidents > 0 ? '#FDF2F2' : 'var(--color-pale-teal)', color: kpis.open_incidents > 0 ? 'var(--color-danger)' : 'var(--color-teal)' }}>
                <AlertTriangle size={16} />
              </div>
            </div>
          </div>
          <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: kpis.open_incidents > 0 ? 'var(--color-danger)' : 'var(--color-ink)', lineHeight: 1 }}>
            {kpis.open_incidents}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '11.5px', color: 'var(--color-muted)' }}>
            {kpis.critical_incidents > 0 ? (
              <span className="badge badge-danger" style={{ padding: '1px 6px', fontSize: '10.5px' }}>
                {kpis.critical_incidents} CRITICAL
              </span>
            ) : (
              <span className="badge badge-success" style={{ padding: '1px 6px', fontSize: '10.5px' }}>
                0 Critical
              </span>
            )}
            <span>•</span>
            <span>CAPA Required</span>
          </div>
        </div>

        {/* Card 6: Scientific Results Status */}
        <div
          className="card"
          style={{ padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }}
          onClick={() => onNavigateSection('results')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
              Scientific Results
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInsight('peer_locking_integrity');
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '2px' }}
                title="Inspect SQL Query & Algebra"
              >
                <Info size={14} />
              </button>
              <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)' }}>
                <Lock size={16} />
              </div>
            </div>
          </div>
          <div className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>
            {kpis.total_results}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '11.5px', color: 'var(--color-muted)' }}>
            <span className="badge badge-success font-mono" style={{ padding: '1px 6px', fontSize: '10.5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <Lock size={10} /> {kpis.locked_results} Locked
            </span>
            <span>•</span>
            <span style={{ color: 'var(--color-muted)' }}>{kpis.draft_results} Draft</span>
          </div>
        </div>
      </div>
    </div>
  );
};
