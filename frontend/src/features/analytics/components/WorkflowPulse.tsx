import React from 'react';
import {
  FlaskConical,
  CheckCircle2,
  TestTubes,
  Lock,
  Info,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { WorkflowPulseData, WorkflowStageMetric } from '../types';

interface WorkflowPulseProps {
  pulse: WorkflowPulseData | null;
  isLoading: boolean;
  onNavigateSection: (section: string) => void;
  onOpenInsight: (metricKey: string) => void;
}

export const WorkflowPulse: React.FC<WorkflowPulseProps> = ({
  pulse,
  isLoading,
  onNavigateSection,
  onOpenInsight,
}) => {
  const getStageIcon = (key: string) => {
    switch (key) {
      case 'specimens':
        return <FlaskConical size={18} />;
      case 'tests':
        return <CheckCircle2 size={18} />;
      case 'experiments':
        return <TestTubes size={18} />;
      case 'results':
        return <Lock size={18} />;
      default:
        return <Layers size={18} />;
    }
  };

  const getStageRoute = (key: string) => {
    switch (key) {
      case 'specimens':
        return 'samples';
      case 'tests':
        return 'tests';
      case 'experiments':
        return 'experiments';
      case 'results':
        return 'results';
      default:
        return 'overview';
    }
  };

  return (
    <div className="card" style={{ padding: '24px', marginBottom: '24px', backgroundColor: 'var(--color-surface)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge badge-success">Feature Two</span>
            <span className="badge badge-sand">Aggregate Operational Flow</span>
            <span className="badge badge-neutral font-mono">Not Sample Lineage DAG</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
              Laboratory Workflow Pulse
            </h2>
            <button
              type="button"
              onClick={() => onOpenInsight('workflow_conversion')}
              title="Inspect DBMS Relational Algebra & Query Plan"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-teal)',
                padding: '2px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <Info size={17} />
            </button>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px', maxWidth: '820px' }}>
            Holistic operational throughput across laboratory lifecycle stages: Accessioned Specimens $\rightarrow$ Quality Assays $\rightarrow$ Research Cohorts $\rightarrow$ Verified Scientific Results.
          </p>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--color-muted)', alignSelf: 'center' }}>
          Click any stage node to inspect records in that module $\rightarrow$
        </div>
      </div>

      {isLoading || !pulse ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
          Aggregating laboratory operational workflow progression...
        </div>
      ) : pulse.stages.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
          No workflow records cataloged yet.
        </div>
      ) : (
        <>
          {/* Responsive SVG / HTML Flow Pipeline */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              position: 'relative',
            }}
          >
            {pulse.stages.map((stage: WorkflowStageMetric, idx: number) => {
              const route = getStageRoute(stage.stage_key);

              return (
                <div
                  key={stage.stage_key}
                  onClick={() => onNavigateSection(route)}
                  className="card"
                  style={{
                    padding: '18px 20px',
                    backgroundColor: 'var(--color-background)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-control)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-teal)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(40, 125, 120, 0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Stage Number & Icon */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--color-pale-teal)',
                          color: 'var(--color-teal)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {getStageIcon(stage.stage_key)}
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                        Stage {idx + 1}
                      </span>
                    </div>

                    {stage.conversion_rate_percent !== undefined && (
                      <span className="badge badge-teal font-mono" style={{ fontSize: '11px' }}>
                        {stage.conversion_rate_percent}% throughput
                      </span>
                    )}
                  </div>

                  {/* Stage Title */}
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '4px' }}>
                    {stage.stage_name}
                  </div>

                  {/* Main Metric Count */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px' }}>
                    <span className="font-mono" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-ink)' }}>
                      {stage.count.toLocaleString()}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                      {stage.unit_label}
                    </span>
                  </div>

                  {/* Active / Verified Subcount Indicator */}
                  {stage.active_subcount !== undefined && (
                    <div
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        fontSize: '11.5px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                      }}
                    >
                      <span style={{ color: 'var(--color-muted)' }}>{stage.subcount_label}:</span>
                      <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-teal)' }}>
                        {stage.active_subcount}
                      </span>
                    </div>
                  )}

                  {/* Operational Dropoff Note */}
                  {stage.dropoff_count !== undefined && stage.dropoff_count > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Incomplete / Draft:</span>
                      <span className="font-mono" style={{ color: '#B45309' }}>
                        {stage.dropoff_count}
                      </span>
                    </div>
                  )}

                  {/* Action Link */}
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--color-border)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--color-teal)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Inspect {stage.unit_label}</span>
                    <ChevronRight size={13} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pipeline Summary Footer */}
        </>
      )}
    </div>
  );
};
