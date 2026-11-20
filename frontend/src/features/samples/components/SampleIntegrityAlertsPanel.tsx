import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Wrench,
} from 'lucide-react';
import { SampleIntegrityAlerts, IntegrityAlertItem } from '../types';

interface Props {
  alertsReport: SampleIntegrityAlerts | null;
  loading: boolean;
  onInspectSample: (sampleId: number) => void;
}

export const SampleIntegrityAlertsPanel: React.FC<Props> = ({
  alertsReport,
  loading,
  onInspectSample,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');

  if (loading && !alertsReport) {
    return null;
  }

  const total = alertsReport?.total_alerts ?? 0;
  const critical = alertsReport?.critical_count ?? 0;
  const warnings = alertsReport?.warning_count ?? 0;
  const infos = alertsReport?.info_count ?? 0;

  // Filtered alerts
  const filteredAlerts = (alertsReport?.alerts ?? []).filter((a) => {
    if (severityFilter === 'ALL') return true;
    return a.severity === severityFilter;
  });

  return (
    <div style={{
      marginBottom: '18px',
      borderRadius: 'var(--radius-card)',
      backgroundColor: total > 0 ? (critical > 0 ? '#FEF2F2' : '#FFFBEB') : '#F0FDF4',
      border: `1px solid ${
        total > 0
          ? critical > 0
            ? 'rgba(239, 68, 68, 0.25)'
            : 'rgba(245, 158, 11, 0.25)'
          : 'rgba(34, 197, 94, 0.25)'
      }`,
      overflow: 'hidden',
      transition: 'all 0.2s ease',
    }}>
      {/* Banner Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {total > 0 ? (
            critical > 0 ? (
              <ShieldAlert size={20} color="var(--color-danger)" />
            ) : (
              <AlertTriangle size={20} color="#D97706" />
            )
          ) : (
            <CheckCircle2 size={20} color="var(--color-success)" />
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: total > 0 ? (critical > 0 ? '#991B1B' : '#92400E') : '#166534',
              }}>
                {total > 0
                  ? `Relational Data Integrity Audit: ${total} Anomaly Flag(s) Detected`
                  : 'Relational Data Integrity Audit: 100% Invariants Satisfied'}
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>
                DBMS Invariant Scanner
              </span>
            </div>

            <div style={{
              fontSize: '11px',
              color: total > 0 ? (critical > 0 ? '#B91C1C' : '#B45309') : '#15803D',
              marginTop: '2px',
            }}>
              {total > 0
                ? `${critical} Critical Violation(s), ${warnings} Warning(s), ${infos} Informational Notice(s) requiring laboratory review.`
                : 'Zero orphaned records, unit mismatches, or invalid storage coordinate states detected.'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {total > 0 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              {critical > 0 && (
                <span className="badge badge-danger font-mono" style={{ fontSize: '10px', padding: '2px 8px' }}>
                  {critical} CRITICAL
                </span>
              )}
              {warnings > 0 && (
                <span className="badge badge-warning font-mono" style={{ fontSize: '10px', padding: '2px 8px' }}>
                  {warnings} WARNING
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              height: '26px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isExpanded ? (
              <>
                <span>Hide Audit</span>
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                <span>Inspect Anomaly List</span>
                <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Audit List */}
      {isExpanded && (
        <div style={{
          padding: '16px 18px',
          backgroundColor: 'var(--color-card-bg)',
          borderTop: '1px solid var(--color-border)',
        }}>
          {total === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-muted)', fontSize: '13px' }}>
              <CheckCircle2 size={28} color="var(--color-success)" style={{ margin: '0 auto 8px' }} />
              All biological specimens strictly satisfy relational integrity invariants.
            </div>
          ) : (
            <>
              {/* Severity Filter Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 600 }}>Filter by Severity:</span>
                {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverityFilter(sev)}
                    className="btn"
                    style={{
                      padding: '3px 10px',
                      fontSize: '11px',
                      borderRadius: '20px',
                      backgroundColor: severityFilter === sev ? 'var(--color-ink)' : 'transparent',
                      color: severityFilter === sev ? '#FFFFFF' : 'var(--color-muted)',
                      border: '1px solid var(--color-border)',
                      fontWeight: 600,
                    }}
                  >
                    {sev} {sev === 'ALL' ? `(${total})` : sev === 'CRITICAL' ? `(${critical})` : sev === 'WARNING' ? `(${warnings})` : `(${infos})`}
                  </button>
                ))}
              </div>

              {/* List of Alerts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
                {filteredAlerts.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '12px' }}>
                    No alerts in {severityFilter} category.
                  </div>
                ) : (
                  filteredAlerts.map((alert: IntegrityAlertItem, idx: number) => {
                    const isCrit = alert.severity === 'CRITICAL';
                    const isWarn = alert.severity === 'WARNING';
                    const sevColor = isCrit ? 'var(--color-danger)' : isWarn ? '#D97706' : 'var(--color-teal)';
                    const sevBg = isCrit ? '#FEF2F2' : isWarn ? '#FFFBEB' : '#F0FDFA';

                    return (
                      <div
                        key={`${alert.rule_code}-${alert.sample_id}-${idx}`}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 'var(--radius-control)',
                          backgroundColor: sevBg,
                          border: `1px solid ${sevColor}30`,
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '14px',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span
                              className="font-mono"
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: sevColor,
                                color: '#FFFFFF',
                              }}
                            >
                              {alert.severity}
                            </span>

                            <button
                              type="button"
                              onClick={() => onInspectSample(alert.sample_id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: 'var(--color-ink)',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                textDecoration: 'underline',
                              }}
                              title="Click to view full specimen dossier"
                            >
                              {alert.sample_code}
                              <ExternalLink size={12} color="var(--color-teal)" />
                            </button>

                            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                              • {alert.sample_name}
                            </span>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--color-ink)', marginBottom: '6px' }}>
                            {alert.description}
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '11px',
                            color: '#065F46',
                            backgroundColor: 'rgba(6, 95, 70, 0.08)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            width: 'fit-content',
                          }}>
                            <Wrench size={12} />
                            <span><strong>Remedy:</strong> {alert.remedy}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onInspectSample(alert.sample_id)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          Inspect Dossier
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
