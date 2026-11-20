import React from 'react';
import {
  Plus,
  FlaskConical,
  TestTubes,
  AlertTriangle,
  BrainCircuit,
  GitFork,
  RefreshCw,
  BarChart3,
} from 'lucide-react';

interface QuickActionsBarProps {
  userRole?: string;
  isScanning: boolean;
  onNavigateSection: (section: string) => void;
  onRunScan: () => void;
}

export const QuickActionsBar: React.FC<QuickActionsBarProps> = ({
  userRole = 'RESEARCHER',
  isScanning,
  onNavigateSection,
  onRunScan,
}) => {
  const canRegister = ['ADMIN', 'RESEARCHER', 'TECHNICIAN'].includes(userRole);
  const canPlanExperiment = ['ADMIN', 'RESEARCHER'].includes(userRole);

  return (
    <div
      className="card"
      style={{
        padding: '10px 16px',
        marginBottom: '18px',
        backgroundColor: 'var(--color-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Actions:
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {canRegister && (
          <button
            type="button"
            onClick={() => onNavigateSection('samples')}
            className="btn btn-secondary"
            style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px' }}
          >
            <Plus size={13} />
            <FlaskConical size={13} />
            Register
          </button>
        )}

        {canPlanExperiment && (
          <button
            type="button"
            onClick={() => onNavigateSection('experiments')}
            className="btn btn-secondary"
            style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px' }}
          >
            <Plus size={13} />
            <TestTubes size={13} />
            New Experiment
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigateSection('incidents')}
          className="btn btn-secondary"
          style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px' }}
        >
          <AlertTriangle size={13} color="var(--color-danger)" />
          Log Incident
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('lineage')}
          className="btn btn-secondary"
          style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px' }}
        >
          <GitFork size={13} />
          Lineage DAG
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('ai_analysis')}
          className="btn btn-secondary"
          style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px' }}
        >
          <BrainCircuit size={13} />
          AI Risk
        </button>

        <button
          type="button"
          onClick={onRunScan}
          disabled={isScanning}
          className="btn btn-primary"
          style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px' }}
        >
          <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
          {isScanning ? 'Scanning...' : 'Scan Database'}
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('reports')}
          className="btn btn-secondary"
          style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px' }}
        >
          <BarChart3 size={13} />
          Reports
        </button>
      </div>
    </div>
  );
};
