import React from 'react';
import {
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  Archive,
  RefreshCw,
  LucideIcon,
} from 'lucide-react';
import { SampleQualityMetrics } from '../types';

export type QualityFilterType = 'ALL' | 'AVAILABLE' | 'LOW_VOLUME' | 'QUARANTINED' | 'MISSING' | 'DEPLETED';

interface Props {
  metrics: SampleQualityMetrics | null;
  loading: boolean;
  activeFilter: QualityFilterType;
  onFilterSelect: (filter: QualityFilterType) => void;
  onRefresh?: () => void;
}

export const SampleQualityMetricsPanel: React.FC<Props> = ({
  metrics,
  loading,
  activeFilter,
  onFilterSelect,
  onRefresh,
}) => {
  const cards: Array<{
    key: QualityFilterType;
    label: string;
    sublabel: string;
    value: number;
    icon: LucideIcon;
    accentColor: string;
    bgHover: string;
  }> = [
    {
      key: 'ALL',
      label: 'Total Specimens',
      sublabel: 'Full active repository',
      value: metrics?.total_samples ?? 0,
      icon: FlaskConical,
      accentColor: 'var(--color-teal)',
      bgHover: 'rgba(34, 102, 102, 0.05)',
    },
    {
      key: 'AVAILABLE',
      label: 'Available Stock',
      sublabel: 'Active & ready with stock',
      value: metrics?.available_samples ?? 0,
      icon: CheckCircle2,
      accentColor: 'var(--color-success)',
      bgHover: 'rgba(46, 125, 90, 0.05)',
    },
    {
      key: 'LOW_VOLUME',
      label: 'Low-Volume Alert',
      sublabel: `≤ ${metrics?.low_volume_threshold ?? 10} units remaining`,
      value: metrics?.low_volume_samples ?? 0,
      icon: AlertTriangle,
      accentColor: '#D97706',
      bgHover: 'rgba(217, 119, 6, 0.05)',
    },
    {
      key: 'QUARANTINED',
      label: 'Quarantined',
      sublabel: 'Biosecurity hold / flagged',
      value: metrics?.quarantined_samples ?? 0,
      icon: ShieldAlert,
      accentColor: '#8B5CF6',
      bgHover: 'rgba(139, 92, 246, 0.05)',
    },
    {
      key: 'MISSING',
      label: 'Missing Specimen',
      sublabel: 'Unaccounted location audit',
      value: metrics?.missing_samples ?? 0,
      icon: HelpCircle,
      accentColor: 'var(--color-danger)',
      bgHover: 'rgba(201, 79, 63, 0.05)',
    },
    {
      key: 'DEPLETED',
      label: 'Depleted Stock',
      sublabel: 'Zero balance / exhausted',
      value: metrics?.depleted_samples ?? 0,
      icon: Archive,
      accentColor: 'var(--color-muted)',
      bgHover: 'rgba(100, 116, 139, 0.05)',
    },
  ];

  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
            color: 'var(--color-muted)',
          }}>
            Sample Quality & Inventory Integrity Intelligence
          </span>
          <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '2px 6px' }}>
            Live DB Telemetry
          </span>
        </div>

        {onRefresh && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={loading}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              height: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Refresh repository quality telemetry"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Sync Metrics
          </button>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '12px',
      }}>
        {cards.map((c) => {
          const isActive = activeFilter === c.key;
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              onClick={() => onFilterSelect(c.key)}
              style={{
                backgroundColor: 'var(--color-card-bg)',
                borderRadius: 'var(--radius-card)',
                padding: '14px 16px',
                border: isActive
                  ? `2px solid ${c.accentColor}`
                  : '1px solid var(--color-border)',
                boxShadow: isActive
                  ? `0 4px 12px ${c.accentColor}25`
                  : '0 1px 3px rgba(0,0,0,0.02)',
                cursor: 'pointer',
                transition: 'all 0.18s ease-in-out',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = c.accentColor;
                  e.currentTarget.style.backgroundColor = c.bgHover;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.backgroundColor = 'var(--color-card-bg)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: isActive ? c.accentColor : 'var(--color-ink)',
                }}>
                  {c.label}
                </span>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  backgroundColor: `${c.accentColor}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={16} color={c.accentColor} />
                </div>
              </div>

              <div>
                <div style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  color: isActive ? c.accentColor : 'var(--color-ink)',
                  lineHeight: '1.2',
                }}>
                  {loading ? '...' : c.value.toLocaleString()}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--color-muted)',
                  marginTop: '4px',
                }}>
                  {c.sublabel}
                </div>
              </div>

              {isActive && (
                <div style={{
                  marginTop: '8px',
                  paddingTop: '6px',
                  borderTop: `1px dashed ${c.accentColor}40`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: c.accentColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  <span>Filtered View</span>
                  <span>Click to reset</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
