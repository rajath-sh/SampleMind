import React, { useState, useEffect } from 'react';
import {
  Scale,
  Clock,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { samplesService } from '../samplesService';
import { SampleQuantityHistoryResponse } from '../types';

interface SampleQuantityVisualizerProps {
  sampleId: number;
  sampleCode: string;
  onSelectSample: (sampleId: number) => void;
}

export const SampleQuantityVisualizer: React.FC<SampleQuantityVisualizerProps> = ({
  sampleId,
  sampleCode,
  onSelectSample,
}) => {
  const [data, setData] = useState<SampleQuantityHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadQuantity() {
      setLoading(true);
      setError(null);
      try {
        const res = await samplesService.getQuantityHistory(sampleId);
        if (isMounted) setData(res);
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load quantity history.';
          setError(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadQuantity();
    return () => {
      isMounted = false;
    };
  }, [sampleId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
        <div>Calculating auditable quantity transactions for {sampleCode}...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        padding: '16px',
        borderRadius: 'var(--radius-control)',
        backgroundColor: '#FDEDEC',
        color: 'var(--color-danger)',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <AlertCircle size={18} />
        <div>{error || 'Unable to retrieve quantity history.'}</div>
      </div>
    );
  }

  const remainingPct = Math.max(0, Math.min(100, 100 - data.utilization_pct));
  const isDepleted = data.current_quantity <= 0;
  const isLowStock = !isDepleted && remainingPct < 25;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Simple explainer banner */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#EFF6FF',
        borderRadius: 'var(--radius-control)',
        border: '1px solid #BFDBFE',
        fontSize: '13px',
        color: '#1E40AF',
        lineHeight: 1.5,
      }}>
        <strong>What is the Quantity Ledger?</strong> Like a bank account for biological volume or weight, this tracks the sample's starting balance and whenever an amount is used, aliquoted, or transferred. It ensures no material is created or lost without a transaction record.
      </div>

      {/* 4 Key Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px',
      }}>
        <div style={{
          padding: '14px 16px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: 'var(--color-pale-teal)',
          border: '1px solid rgba(40, 125, 120, 0.25)',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Initial Accession Stock
          </div>
          <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-ink)', marginTop: '4px' }}>
            {data.initial_quantity.toFixed(2)} <span style={{ fontSize: '13px', fontWeight: 500 }}>{data.quantity_unit}</span>
          </div>
        </div>

        <div style={{
          padding: '14px 16px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--color-border)',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Transferred / Utilized
          </div>
          <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: '#A0522D', marginTop: '4px' }}>
            {data.total_deducted.toFixed(2)} <span style={{ fontSize: '13px', fontWeight: 500 }}>{data.quantity_unit}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
            {data.utilization_pct.toFixed(1)}% of original stock
          </div>
        </div>

        <div style={{
          padding: '14px 16px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: isDepleted ? '#FDEDEC' : isLowStock ? '#FEF9E7' : '#FFFFFF',
          border: `1.5px solid ${isDepleted ? 'var(--color-danger)' : isLowStock ? 'var(--color-warning)' : 'var(--color-teal)'}`,
        }}>
          <div style={{ fontSize: '11px', color: isDepleted ? 'var(--color-danger)' : 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Remaining Available Stock
          </div>
          <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: isDepleted ? 'var(--color-danger)' : 'var(--color-teal)', marginTop: '4px' }}>
            {data.current_quantity.toFixed(2)} <span style={{ fontSize: '13px', fontWeight: 500 }}>{data.quantity_unit}</span>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: isDepleted ? 'var(--color-danger)' : 'var(--color-teal)', marginTop: '2px' }}>
            {isDepleted ? 'Stock Fully Depleted' : `${remainingPct.toFixed(1)}% Available`}
          </div>
        </div>

        <div style={{
          padding: '14px 16px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--color-border)',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Aliquot Derivations
          </div>
          <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-ink)', marginTop: '4px' }}>
            {data.derivation_count} <span style={{ fontSize: '13px', fontWeight: 500 }}>Child Extract{data.derivation_count === 1 ? '' : 's'}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
            Tracked in DAG lineage
          </div>
        </div>
      </div>

      {/* Visual Proportional Stock Bar */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scale size={16} color="var(--color-teal)" />
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
              Proportional Material Distribution Balance
            </h4>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
            Total Baseline: <strong>{data.initial_quantity.toFixed(2)} {data.quantity_unit}</strong>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div style={{
          height: '24px',
          borderRadius: '12px',
          backgroundColor: '#E8ECF0',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
        }}>
          {/* Remaining Stock Segment */}
          {remainingPct > 0 && (
            <div
              style={{
                width: `${remainingPct}%`,
                backgroundColor: isLowStock ? 'var(--color-warning)' : 'var(--color-teal)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                transition: 'width 0.3s ease',
              }}
              title={`Remaining Stock: ${data.current_quantity.toFixed(2)} ${data.quantity_unit} (${remainingPct.toFixed(1)}%)`}
            >
              {remainingPct > 15 && `Available ${remainingPct.toFixed(0)}%`}
            </div>
          )}

          {/* Utilized / Aliquoted Stock Segment */}
          {data.utilization_pct > 0 && (
            <div
              style={{
                width: `${data.utilization_pct}%`,
                backgroundColor: '#D4AC88',
                color: 'var(--color-ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                transition: 'width 0.3s ease',
              }}
              title={`Aliquoted: ${data.total_deducted.toFixed(2)} ${data.quantity_unit} (${data.utilization_pct.toFixed(1)}%)`}
            >
              {data.utilization_pct > 15 && `Derived ${data.utilization_pct.toFixed(0)}%`}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'var(--color-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: isLowStock ? 'var(--color-warning)' : 'var(--color-teal)' }} />
            Remaining Available Stock ({data.current_quantity.toFixed(2)} {data.quantity_unit})
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#D4AC88' }} />
            Transferred to Derived Aliquots ({data.total_deducted.toFixed(2)} {data.quantity_unit})
          </span>
        </div>
      </div>

      {/* Auditable Transaction Ledger Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-background)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={15} color="var(--color-teal)" />
            Auditable Quantity Balance Ledger ({data.transactions.length} Events)
          </h4>
          <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
            Double-entry stock ledger
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: '12px' }}>
            <thead>
              <tr>
                <th>Event Date & Time</th>
                <th>Operation</th>
                <th style={{ textAlign: 'right' }}>Transfer Delta</th>
                <th style={{ textAlign: 'right' }}>Balance After</th>
                <th>Reference Specimen</th>
                <th>Authorized Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((tx, idx) => {
                const isPositive = tx.quantity_delta > 0;

                return (
                  <tr key={tx.transaction_id || idx}>
                    <td style={{ color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(tx.event_timestamp).toLocaleDateString()} {new Date(tx.event_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <span className={`badge ${
                        tx.transaction_type === 'INITIAL_REGISTRATION'
                          ? 'badge-success'
                          : tx.transaction_type === 'ALIQUOT_DERIVATION'
                          ? 'badge-sand'
                          : 'badge-neutral'
                      }`} style={{ fontSize: '10px' }}>
                        {tx.transaction_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: isPositive ? 'var(--color-success)' : 'var(--color-danger)',
                    }}>
                      {isPositive ? `+${tx.quantity_delta.toFixed(2)}` : tx.quantity_delta.toFixed(2)} {tx.quantity_unit}
                    </td>
                    <td style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: 'var(--color-ink)',
                    }}>
                      {tx.balance_after.toFixed(2)} {tx.quantity_unit}
                    </td>
                    <td>
                      {tx.reference_sample_code ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-teal)' }}>
                            {tx.reference_sample_code}
                          </span>
                          {tx.reference_sample_id && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '1px 6px', fontSize: '10px' }}
                              onClick={() => onSelectSample(tx.reference_sample_id!)}
                            >
                              Jump <ExternalLink size={9} style={{ verticalAlign: '-1px' }} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--color-muted)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.notes || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
