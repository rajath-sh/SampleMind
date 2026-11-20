import React from 'react';
import {
  Activity,
  RefreshCw,
} from 'lucide-react';
import { OperationalStatusData } from '../types';

interface OperationalBannerProps {
  user?: {
    display_name: string;
    role: string;
    email: string;
  };
  operationalStatus: OperationalStatusData | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const OperationalBanner: React.FC<OperationalBannerProps> = ({
  user,
  operationalStatus,
  isLoading,
  onRefresh,
}) => {
  return (
    <div
      className="card"
      style={{
        padding: '24px',
        marginBottom: '24px',
        backgroundColor: 'var(--color-surface)',
        borderLeft: '4px solid var(--color-teal)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={12} /> Live Telemetry
            </span>
            <span className="badge badge-sand">RVCE DBMS Lab CD-2 Baseline</span>
            <span className="badge badge-neutral font-mono">
              {operationalStatus?.database_engine || 'Detecting Relational Engine...'}
            </span>
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '4px' }}>
            BioTrace Lab Command Centre • Welcome, {user?.display_name || 'Researcher'}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', maxWidth: '720px', margin: 0 }}>
            Real-time scientific laboratory operations, cryogenic capacity telemetry, QC assay throughput, and automated relational data-quality monitoring active for <strong>{user?.role}</strong>.
          </p>
        </div>

        {/* Live Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              gap: '16px',
              padding: '10px 16px',
              backgroundColor: 'var(--color-pale-teal)',
              borderRadius: 'var(--radius-control)',
              border: '1px solid rgba(40, 125, 120, 0.2)',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Role</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-teal)' }}>{user?.role || 'RESEARCHER'}</div>
            </div>
            <div style={{ width: '1px', backgroundColor: 'rgba(40, 125, 120, 0.2)' }} />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>DBMS Relations</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
                {operationalStatus?.total_relations || 19} Verified
              </div>
            </div>
            <div style={{ width: '1px', backgroundColor: 'rgba(40, 125, 120, 0.2)' }} />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Query Latency</div>
              <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-success)' }}>
                {operationalStatus ? `${operationalStatus.ping_latency_ms} ms` : 'Checking...'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="btn btn-secondary"
            title="Refresh Operational Metrics"
            style={{ padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span style={{ fontSize: '12px' }}>Refresh</span>
          </button>
        </div>
      </div>
    </div>
  );
};
