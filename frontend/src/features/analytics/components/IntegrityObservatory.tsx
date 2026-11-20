import React, { useState } from 'react';
import {
  ShieldCheck,
  Info,
  RefreshCw,
  ExternalLink,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { IntegrityScanData, IntegrityFinding } from '../types';

interface IntegrityObservatoryProps {
  scanData: IntegrityScanData | null;
  isScanning: boolean;
  onRunScan: () => void;
  onNavigateSection: (section: string) => void;
  onOpenInsight: (metricKey: string) => void;
}

export const IntegrityObservatory: React.FC<IntegrityObservatoryProps> = ({
  scanData,
  isScanning,
  onRunScan,
  onNavigateSection,
  onOpenInsight,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'ERROR' | 'WARNING' | 'INFO'>('ALL');
  const [isResearchDrawerOpen, setIsResearchDrawerOpen] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(4);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'ERROR':
        return <span className="badge badge-danger">ERROR</span>;
      case 'WARNING':
        return <span className="badge badge-warning">WARNING</span>;
      case 'INFO':
      default:
        return <span className="badge badge-neutral">OBSERVATION</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPTIMAL':
        return <span className="badge badge-success">OPTIMAL (0 ERRORS)</span>;
      case 'ATTENTION_REQUIRED':
        return <span className="badge badge-sand">ATTENTION REQUIRED</span>;
      case 'DEVIANT':
      default:
        return <span className="badge badge-danger">DEVIATIONS DETECTED</span>;
    }
  };

  const filteredFindings = scanData?.findings.filter((f: IntegrityFinding) => {
    if (severityFilter === 'ALL') return true;
    return f.severity === severityFilter;
  }) || [];

  return (
    <div className="card" style={{ padding: '24px', marginBottom: '24px', backgroundColor: 'var(--color-surface)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge badge-success">Feature Three</span>
            <span className="badge badge-sand">Research-Inspired (Johns et al. 2025)</span>
            {scanData && getStatusBadge(scanData.overall_integrity_status)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
              Data Quality & Relational Integrity Observatory
            </h2>
            <button
              type="button"
              onClick={() => onOpenInsight('quarantine_compliance')}
              title="Inspect Integrity Check Relational Algebra & Query"
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
            Automated database invariant validator executing 8 relational checks across physical storage assignments, stock depletion states, critical biosafety quarantines, and calibration intervals.
          </p>
        </div>

        {/* Scan Actions */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setIsResearchDrawerOpen(!isResearchDrawerOpen)}
            className="btn btn-secondary"
            style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <BookOpen size={14} />
            {isResearchDrawerOpen ? 'Hide Citations' : 'Research Basis'}
          </button>

          <button
            type="button"
            onClick={onRunScan}
            disabled={isScanning}
            className="btn btn-primary"
            style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
            {isScanning ? 'Executing SQL Scan...' : 'Run Integrity Scan'}
          </button>
        </div>
      </div>

      {/* Research Inspiration Drawer */}
      {isResearchDrawerOpen && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 'var(--radius-control)',
            backgroundColor: 'var(--color-pale-teal)',
            border: '1px solid rgba(40, 125, 120, 0.25)',
            marginBottom: '20px',
            fontSize: '12.5px',
            color: 'var(--color-ink)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--color-teal)', marginBottom: '4px' }}>
            Academic Literature Inspiration:
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            <li>
              <strong>Johns, Baum & Prasser (2025)</strong>: <em>"Tracking provenance in clinical data warehouses for quality management"</em> (Int. J. Med. Inform.). Inspires our actionable findings structure linking inconsistencies to root causes and suggested remedies.
            </li>
            <li>
              <strong>Wack, Coulet, Burgun & Rance (2025)</strong>: <em>"Enhancing clinical data warehousing with provenance data to support longitudinal analyses"</em> (J. Biomed. Inform.). Inspires our traceable relational verification linking anomalies directly back to origin entities.
            </li>
          </ul>
        </div>
      )}

      {/* Multidimensional Category Score Banner */}
      {scanData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {scanData.category_scores.map((cat) => (
            <div
              key={cat.category}
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-control)',
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                {cat.category}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
                <span className="font-mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-ink)' }}>
                  {cat.compliance_score_percent}%
                </span>
                <span style={{ fontSize: '11px', color: cat.errors > 0 ? 'var(--color-danger)' : cat.warnings > 0 ? '#B45309' : 'var(--color-success)', fontWeight: 600 }}>
                  {cat.errors > 0 ? `${cat.errors} Error(s)` : cat.warnings > 0 ? `${cat.warnings} Warning(s)` : 'Passed Clean'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Findings Section Header & Filter Pills */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
          Detailed Actionable Findings ({filteredFindings.length} of {scanData?.findings.length || 0})
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setSeverityFilter('ALL')}
            className={`badge ${severityFilter === 'ALL' ? 'badge-teal' : 'badge-neutral'}`}
            style={{ border: 'none', cursor: 'pointer', padding: '4px 8px' }}
          >
            All Findings ({scanData?.findings.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setSeverityFilter('ERROR')}
            className={`badge ${severityFilter === 'ERROR' ? 'badge-danger' : 'badge-neutral'}`}
            style={{ border: 'none', cursor: 'pointer', padding: '4px 8px' }}
          >
            Errors ({scanData?.findings.filter((f) => f.severity === 'ERROR').length || 0})
          </button>
          <button
            type="button"
            onClick={() => setSeverityFilter('WARNING')}
            className={`badge ${severityFilter === 'WARNING' ? 'badge-sand' : 'badge-neutral'}`}
            style={{ border: 'none', cursor: 'pointer', padding: '4px 8px' }}
          >
            Warnings ({scanData?.findings.filter((f) => f.severity === 'WARNING').length || 0})
          </button>
        </div>
      </div>

      {/* Findings List */}
      {isScanning ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-muted)' }}>
          Evaluating 8 SQL constraints and integrity assertions against relational tables...
        </div>
      ) : filteredFindings.length === 0 ? (
        <div
          style={{
            padding: '30px',
            textAlign: 'center',
            backgroundColor: 'var(--color-background)',
            borderRadius: 'var(--radius-control)',
            border: '1px dashed var(--color-border)',
          }}
        >
          <ShieldCheck size={28} color="var(--color-success)" style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
            No Inconsistencies Found Matching Filter
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
            All evaluated database invariants and biosafety constraints are compliant.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredFindings.slice(0, displayLimit).map((finding, idx) => {
            const isExpanded = expandedIndex === idx;

            return (
              <div
                key={`${finding.rule_id}-${idx}`}
                className="card"
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--color-background)',
                  borderLeft: `4px solid ${
                    finding.severity === 'ERROR'
                      ? 'var(--color-danger)'
                      : finding.severity === 'WARNING'
                      ? 'var(--color-warning)'
                      : 'var(--color-teal)'
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {getSeverityBadge(finding.severity)}
                    <span className="font-mono" style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--color-ink)' }}>
                      {finding.rule_id}
                    </span>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-ink)' }}>
                      • {finding.rule_name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge-neutral font-mono" style={{ fontSize: '10.5px' }}>
                      {finding.entity_type} {finding.record_code ? `#${finding.record_code}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigateSection(finding.action_route)}
                      className="btn btn-secondary"
                      style={{ padding: '2px 7px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                    >
                      <span>Inspect</span>
                      <ExternalLink size={10} />
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div style={{ fontSize: '12.5px', color: 'var(--color-ink)', marginBottom: '6px', lineHeight: 1.35 }}>
                  {finding.description}
                </div>

                {/* Toggle Details / Root Cause */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--color-teal)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {isExpanded ? 'Hide Root Cause & Remedy' : 'View Relational Root Cause & Remedy'}
                  </button>
                </div>

                {/* Relational Root Cause & Remedy (Collapsible) */}
                {isExpanded && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: '10px',
                      padding: '10px 12px',
                      marginTop: '8px',
                      backgroundColor: '#FFFFFF',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      fontSize: '11.5px',
                      lineHeight: 1.4,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', fontSize: '10.5px' }}>
                        Relational Failure Mode:
                      </span>
                      <div style={{ color: 'var(--color-ink)', marginTop: '2px' }}>
                        {finding.root_cause_explanation}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--color-teal)', textTransform: 'uppercase', fontSize: '10.5px' }}>
                        Suggested Remediation:
                      </span>
                      <div style={{ color: 'var(--color-ink)', marginTop: '2px' }}>
                        {finding.suggested_remedy}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Show More / Fewer Button */}
          {filteredFindings.length > 4 && (
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setDisplayLimit(displayLimit === 4 ? filteredFindings.length : 4)}
                className="btn btn-secondary"
                style={{ fontSize: '11.5px', padding: '5px 14px', borderRadius: '20px' }}
              >
                {displayLimit === 4 ? (
                  <>Showing 4 of {filteredFindings.length} findings • Show All ({filteredFindings.length}) ↓</>
                ) : (
                  <>Showing all {filteredFindings.length} findings • Show Top 4 Only ↑</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
