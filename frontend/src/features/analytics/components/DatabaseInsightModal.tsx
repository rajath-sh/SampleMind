import React, { useEffect } from 'react';
import {
  X,
  Database,
  Code2,
  Cpu,
  Layers,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { DatabaseInsightData } from '../types';

interface DatabaseInsightModalProps {
  insight: DatabaseInsightData | null;
  isLoading: boolean;
  onClose: () => void;
}

export const DatabaseInsightModal: React.FC<DatabaseInsightModalProps> = ({
  insight,
  isLoading,
  onClose,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!insight && !isLoading) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(23, 43, 58, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-card)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          border: '1px solid var(--color-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--color-pale-teal)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-teal)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Database size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                DBMS Lab Architectural Inspector • Part-B Baseline
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
                {insight?.metric_title || 'Database Query Insight'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-muted)',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {isLoading || !insight ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
              Introspecting relational engine and query execution plan...
            </div>
          ) : (
            <>
              {/* Relational Entity & Schema Badge */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="badge badge-teal font-mono">
                  Target Entity: {insight.entity_name}
                </span>
                <span className="badge badge-neutral font-mono">
                  Underlying Table(s): {insight.target_table}
                </span>
                <span className="badge badge-sand font-mono">
                  Concept: {insight.relational_concept}
                </span>
              </div>

              {/* Verified SQL Query */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Code2 size={16} color="var(--color-teal)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
                    Actual SQL Aggregation Query
                  </span>
                </div>
                <pre
                  style={{
                    backgroundColor: 'var(--color-navy)',
                    color: '#E6F2F0',
                    padding: '16px',
                    borderRadius: 'var(--radius-control)',
                    fontSize: '12.5px',
                    fontFamily: 'var(--font-mono, monospace)',
                    lineHeight: 1.5,
                    overflowX: 'auto',
                    border: '1px solid rgba(220, 228, 225, 0.2)',
                  }}
                >
                  {insight.sql_query}
                </pre>
              </div>

              {/* Relational Algebra & Join Explanation */}
              <div className="card" style={{ padding: '16px', backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Layers size={16} color="var(--color-teal)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
                    Relational Join Rationale & Plan Summary
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--color-ink)', lineHeight: 1.5, margin: 0 }}>
                  {insight.query_plan_summary}
                </p>
                {insight.join_explanation && (
                  <p style={{ fontSize: '12.5px', color: 'var(--color-muted)', lineHeight: 1.5, marginTop: '8px', marginBottom: 0 }}>
                    <strong>Join Selection:</strong> {insight.join_explanation}
                  </p>
                )}
              </div>

              {/* Count Inflation Risk Explanation */}
              {insight.count_inflation_risk_explanation && (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-control)',
                    backgroundColor: '#FEF9F0',
                    borderLeft: '4px solid var(--color-warning)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}
                >
                  <AlertCircle size={18} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#92400E', marginBottom: '2px' }}>
                      DBMS Lab Insight: Row Count Inflation Risk
                    </div>
                    <div style={{ fontSize: '12px', color: '#B45309', lineHeight: 1.45 }}>
                      {insight.count_inflation_risk_explanation}
                    </div>
                  </div>
                </div>
              )}

              {/* Performance & Indexing Notes */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Cpu size={16} color="var(--color-teal)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
                    Index Utilization & Query Complexity
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--color-muted)', lineHeight: 1.45 }}>
                  {insight.performance_notes}
                </div>
              </div>

              {/* Verified Sample Output Payload */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <CheckCircle2 size={16} color="var(--color-success)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
                    Verified Database Output Data
                  </span>
                </div>
                <pre
                  style={{
                    backgroundColor: '#FFFFFF',
                    color: 'var(--color-ink)',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-control)',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono, monospace)',
                    border: '1px solid var(--color-border)',
                    margin: 0,
                  }}
                >
                  {JSON.stringify(insight.example_output, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'var(--color-background)',
          }}
        >
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ fontSize: '13px' }}>
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
