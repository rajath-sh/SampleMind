import React from 'react';
import {
  CheckCircle2,
  Clock,
  ShieldAlert,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { TestQualityMetricsResponse } from './types';

interface TestQualityPanelProps {
  metrics: TestQualityMetricsResponse | null;
  loading: boolean;
  onFilterByStatus?: (status: string) => void;
  onFilterByOutcome?: (outcome: string) => void;
}

export const TestQualityPanel: React.FC<TestQualityPanelProps> = ({
  metrics,
  loading,
  onFilterByStatus,
  onFilterByOutcome,
}) => {
  if (loading && !metrics) {
    return (
      <div className="card" style={{ padding: '16px 20px', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '13px', color: 'var(--color-muted)' }}>Loading analytical quality metrics...</div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        {/* Total Assays */}
        <div
          className="card"
          style={{ padding: '14px 18px', cursor: 'pointer', transition: 'all 0.15s ease' }}
          onClick={() => onFilterByStatus?.('')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-muted)', letterSpacing: '0.4px' }}>
              Analytical Assays
            </span>
            <Layers size={16} color="var(--color-teal)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-ink)', marginTop: '4px' }}>
            {metrics.total_tests}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
            <strong style={{ color: 'var(--color-success)' }}>{metrics.completed_tests}</strong> completed · <strong style={{ color: 'var(--color-warning)' }}>{metrics.in_progress_tests}</strong> in progress
          </div>
        </div>

        {/* First-Pass QC Compliance Rate */}
        <div
          className="card"
          style={{ padding: '14px 18px', cursor: 'pointer', transition: 'all 0.15s ease' }}
          onClick={() => onFilterByOutcome?.('OPTIMAL')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-muted)', letterSpacing: '0.4px' }}>
              First-Pass QC Rate
            </span>
            <CheckCircle2 size={16} color="var(--color-success)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-success)', marginTop: '4px' }}>
            {metrics.pass_rate_pct.toFixed(1)}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
            ISO 17025 tolerance verified
          </div>
        </div>

        {/* Average Turnaround Time (TAT) */}
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-muted)', letterSpacing: '0.4px' }}>
              Average TAT
            </span>
            <Clock size={16} color="var(--color-teal)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-ink)', marginTop: '4px' }}>
            {metrics.avg_turnaround_hours !== null && metrics.avg_turnaround_hours !== undefined
              ? `${metrics.avg_turnaround_hours.toFixed(1)}h`
              : 'N/A'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
            Request-to-execution latency
          </div>
        </div>

        {/* Contamination & Quarantine Hold Rate */}
        <div
          className="card"
          style={{
            padding: '14px 18px',
            cursor: 'pointer',
            backgroundColor: metrics.quarantined_samples_count > 0 ? '#FDEDEC' : undefined,
            borderColor: metrics.quarantined_samples_count > 0 ? 'rgba(201, 79, 63, 0.4)' : undefined,
          }}
          onClick={() => onFilterByOutcome?.('CONTAMINATED')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: metrics.quarantined_samples_count > 0 ? 'var(--color-danger)' : 'var(--color-muted)', letterSpacing: '0.4px' }}>
              QC Hold & Quarantine
            </span>
            <ShieldAlert size={16} color={metrics.quarantined_samples_count > 0 ? 'var(--color-danger)' : 'var(--color-muted)'} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: metrics.quarantined_samples_count > 0 ? 'var(--color-danger)' : 'var(--color-ink)', marginTop: '4px' }}>
            {metrics.quarantined_samples_count}
          </div>
          <div style={{ fontSize: '11px', color: metrics.quarantined_samples_count > 0 ? 'var(--color-danger)' : 'var(--color-muted)', marginTop: '2px' }}>
            {metrics.contamination_rate_pct.toFixed(1)}% assay failure/contam rate
          </div>
        </div>
      </div>

      {/* Recent Alerts Ticker if any */}
      {metrics.recent_qc_alerts.length > 0 && (
        <div style={{
          padding: '8px 14px',
          backgroundColor: '#FDEDEC',
          border: '1px solid rgba(201, 79, 63, 0.3)',
          borderRadius: 'var(--radius-control)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--color-danger)',
        }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 700 }}>QC Breach Alert:</span>
          <span style={{ color: 'var(--color-ink)' }}>
            Specimen <strong>{metrics.recent_qc_alerts[0].sample_code}</strong> breached thresholds in '{metrics.recent_qc_alerts[0].test_type}' ({metrics.recent_qc_alerts[0].result_interpretation}). Target specimen auto-quarantined.
          </span>
        </div>
      )}
    </div>
  );
};
