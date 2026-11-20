import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Lightbulb,
  Award,
} from 'lucide-react';
import { SampleReadiness } from '../types';
import { samplesService } from '../samplesService';

interface Props {
  sampleId: number;
}

export const SampleReadinessAssessment: React.FC<Props> = ({ sampleId }) => {
  const [readiness, setReadiness] = useState<SampleReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchReadiness() {
      setLoading(true);
      setError(null);
      try {
        const data = await samplesService.getSampleReadiness(sampleId);
        if (isMounted) setReadiness(data);
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to assess specimen readiness.';
          setError(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchReadiness();
    return () => {
      isMounted = false;
    };
  }, [sampleId]);

  if (loading) {
    return (
      <div style={{
        padding: '24px',
        textAlign: 'center',
        backgroundColor: 'var(--color-card-bg)',
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--color-border)',
      }}>
        <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--color-teal)' }} />
        <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
          Computing specimen experimental readiness parameters across 5 laboratory dimensions...
        </div>
      </div>
    );
  }

  if (error || !readiness) {
    return (
      <div style={{
        padding: '16px',
        backgroundColor: '#FEF2F2',
        borderRadius: 'var(--radius-card)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        color: 'var(--color-danger)',
        fontSize: '12px',
      }}>
        <AlertTriangle size={16} style={{ verticalAlign: '-3px', marginRight: '6px' }} />
        {error || 'Unable to calculate specimen readiness assessment.'}
      </div>
    );
  }

  const isReady = readiness.overall_status === 'READY';
  const isReview = readiness.overall_status === 'NEEDS_REVIEW';
  const isUnavailable = readiness.overall_status === 'UNAVAILABLE';

  const statusColor = isReady
    ? 'var(--color-success)'
    : isReview
    ? '#D97706'
    : 'var(--color-danger)';

  const statusBg = isReady
    ? 'rgba(46, 125, 90, 0.08)'
    : isReview
    ? 'rgba(217, 119, 6, 0.08)'
    : 'rgba(201, 79, 63, 0.08)';

  const statusLabel = isReady
    ? 'CLEARED FOR EXPERIMENTAL PROCEDURES'
    : isReview
    ? 'CONDITIONAL / PROTOCOL REVIEW REQUIRED'
    : 'RESTRICTED / INELIGIBLE FOR USE';

  return (
    <div style={{
      borderRadius: 'var(--radius-card)',
      backgroundColor: 'var(--color-card-bg)',
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
      marginBottom: '20px',
    }}>
      {/* Top Banner */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: statusBg,
        borderBottom: `1px solid ${statusColor}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: `${statusColor}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {isReady ? (
              <Award size={22} color={statusColor} />
            ) : isReview ? (
              <AlertTriangle size={22} color={statusColor} />
            ) : (
              <XCircle size={22} color={statusColor} />
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                color: statusColor,
                letterSpacing: '0.06em',
              }}>
                {statusLabel}
              </span>
              <span className="badge font-mono" style={{
                fontSize: '10px',
                backgroundColor: statusColor,
                color: '#FFFFFF',
                fontWeight: 700,
              }}>
                {readiness.overall_status}
              </span>
            </div>

            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', marginTop: '2px' }}>
              Scientific Readiness & Multi-Parameter Viability Assessment
            </div>
          </div>
        </div>

        {/* Score Bar */}
        <div style={{ minWidth: '150px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
            <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>Readiness Score</span>
            <span style={{ fontWeight: 800, color: statusColor, fontFamily: 'monospace' }}>
              {readiness.readiness_score} / 100
            </span>
          </div>
          <div style={{
            height: '8px',
            backgroundColor: 'rgba(0,0,0,0.08)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.max(5, readiness.readiness_score)}%`,
              height: '100%',
              backgroundColor: statusColor,
              borderRadius: '4px',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      </div>

      {/* 5 Laboratory Evaluation Dimensions Checklist */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-muted)',
          marginBottom: '12px',
        }}>
          5 Standardized Evaluation Dimensions
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {readiness.checks.map((check) => {
            const isCheckPass = check.passed;
            const isWarn = check.severity === 'WARNING';
            const isCrit = check.severity === 'CRITICAL';

            const itemIcon = isCheckPass && !isWarn ? (
              <CheckCircle2 size={16} color="var(--color-success)" style={{ flexShrink: 0 }} />
            ) : isWarn ? (
              <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0 }} />
            ) : (
              <XCircle size={16} color="var(--color-danger)" style={{ flexShrink: 0 }} />
            );

            return (
              <div
                key={check.check_id}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-control)',
                  backgroundColor: !isCheckPass && isCrit ? '#FEF2F2' : isWarn ? '#FFFBEB' : '#F9FAFB',
                  border: `1px solid ${
                    !isCheckPass && isCrit
                      ? 'rgba(239, 68, 68, 0.2)'
                      : isWarn
                      ? 'rgba(217, 119, 6, 0.2)'
                      : 'var(--color-border)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {itemIcon}
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)' }}>
                      {check.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
                      {check.message}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: check.score_points === check.max_points ? 'var(--color-success)' : check.score_points > 0 ? '#D97706' : 'var(--color-danger)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(0,0,0,0.04)',
                    }}
                  >
                    +{check.score_points}/{check.max_points} pts
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actionable Recommendations */}
        {readiness.recommendations.length > 0 && (
          <div style={{
            marginTop: '16px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-control)',
            backgroundColor: isUnavailable ? '#FEF2F2' : 'rgba(34, 102, 102, 0.05)',
            border: `1px solid ${isUnavailable ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 102, 102, 0.2)'}`,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: isUnavailable ? 'var(--color-danger)' : 'var(--color-teal)',
              marginBottom: '6px',
            }}>
              <Lightbulb size={14} />
              <span>Actionable Laboratory Protocol Recommendations</span>
            </div>

            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--color-ink)' }}>
              {readiness.recommendations.map((rec, i) => (
                <li key={i} style={{ marginBottom: i === readiness.recommendations.length - 1 ? 0 : '4px' }}>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
