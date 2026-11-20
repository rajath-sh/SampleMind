import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Clock,
  User,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { samplesService } from '../samplesService';
import { ChainOfCustodyResponse } from '../types';

interface SampleCustodyTimelineProps {
  sampleId: number;
  sampleCode: string;
}

export const SampleCustodyTimeline: React.FC<SampleCustodyTimelineProps> = ({
  sampleId,
  sampleCode,
}) => {
  const [custody, setCustody] = useState<ChainOfCustodyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadCustody() {
      setLoading(true);
      setError(null);
      try {
        const data = await samplesService.getChainOfCustody(sampleId);
        if (isMounted) setCustody(data);
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load chain of custody.';
          setError(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadCustody();
    return () => {
      isMounted = false;
    };
  }, [sampleId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
        <div>Reconstructing chronological chain of custody for {sampleCode}...</div>
      </div>
    );
  }

  if (error || !custody) {
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
        <div>{error || 'Unable to retrieve chain of custody.'}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Summary Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 18px',
        backgroundColor: 'var(--color-pale-teal)',
        borderRadius: 'var(--radius-control)',
        border: '1px solid rgba(40, 125, 120, 0.2)',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Physical Chain-of-Custody Audit Trail
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)' }}>
              {custody.total_movements} Physical Movement Handoff{custody.total_movements === 1 ? '' : 's'}
            </span>
            <span className="badge badge-success" style={{ fontSize: '11px' }}>
              Current Coordinate: {custody.current_location_code || 'Unassigned'}
            </span>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
          Specimen Status: <strong style={{ color: 'var(--color-teal)' }}>{custody.current_status}</strong>
        </div>
      </div>

      {/* Chronological Timeline Container */}
      {custody.steps.length === 0 ? (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--color-muted)',
          backgroundColor: 'var(--color-background)',
          borderRadius: 'var(--radius-control)',
          fontSize: '13px',
        }}>
          No physical storage relocation events recorded for this specimen yet.
        </div>
      ) : (
        <div style={{
          position: 'relative',
          paddingLeft: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}>
          {/* Vertical Track Line */}
          <div style={{
            position: 'absolute',
            left: '14px',
            top: '12px',
            bottom: '24px',
            width: '2px',
            backgroundColor: 'var(--color-teal)',
            opacity: 0.35,
          }} />

          {custody.steps.map((step, idx) => {
            const isInitial = idx === 0;
            const isLatest = idx === custody.steps.length - 1;

            return (
              <div key={step.step_number} style={{ position: 'relative' }}>
                {/* Numbered Step Circle */}
                <div style={{
                  position: 'absolute',
                  left: '-32px',
                  top: '0',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: isLatest ? 'var(--color-teal)' : isInitial ? '#287D78' : '#FFFFFF',
                  color: isLatest || isInitial ? '#FFFFFF' : 'var(--color-teal)',
                  border: '2px solid var(--color-teal)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  zIndex: 2,
                }}>
                  {step.step_number}
                </div>

                {/* Event Card */}
                <div style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 'var(--radius-control)',
                  border: isLatest ? '1.5px solid var(--color-teal)' : '1px solid var(--color-border)',
                  padding: '14px 18px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
                        {step.action_label}
                      </span>
                      {isInitial && (
                        <span className="badge badge-sand" style={{ fontSize: '10px' }}>
                          Accession Placement
                        </span>
                      )}
                      {isLatest && custody.steps.length > 1 && (
                        <span className="badge badge-success" style={{ fontSize: '10px' }}>
                          Current Custody
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--color-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        {new Date(step.event_timestamp).toLocaleDateString()} {new Date(step.event_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {step.elapsed_time_human && (
                        <span className="badge badge-neutral" style={{ fontSize: '10px', padding: '1px 6px' }}>
                          {step.elapsed_time_human}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Location Handoff Flow */}
                  <div style={{
                    marginTop: '10px',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-background)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}>
                    {/* From Location */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>From:</span>
                      {step.from_location_code ? (
                        <div>
                          <strong className="font-mono" style={{ fontSize: '12px', color: 'var(--color-ink)' }}>
                            {step.from_location_code}
                          </strong>
                          {step.from_facility && (
                            <span style={{ fontSize: '11px', color: 'var(--color-muted)', marginLeft: '4px' }}>
                              ({step.from_facility})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                          Registration Accession Point
                        </span>
                      )}
                    </div>

                    <ArrowRight size={14} color="var(--color-teal)" />

                    {/* To Location */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>To:</span>
                      <div>
                        <strong className="font-mono" style={{ fontSize: '13px', color: 'var(--color-teal)' }}>
                          {step.to_location_code || 'Unassigned / Checkout'}
                        </strong>
                        {step.to_facility && (
                          <span style={{ fontSize: '11px', color: 'var(--color-muted)', marginLeft: '4px' }}>
                            ({step.to_facility} {step.to_unit_label ? `• ${step.to_unit_label}` : ''} {step.to_slot ? `• Slot ${step.to_slot}` : ''})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Metadata Row: Custodian & Movement Reason */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--color-ink)' }}>
                      <User size={13} color="var(--color-muted)" />
                      <span>Authorized Operator: <strong>{step.moved_by_name || 'System Operator'}</strong></span>
                    </div>

                    {step.reason && (
                      <div style={{ color: 'var(--color-muted)', fontStyle: 'italic', fontSize: '11px' }}>
                        Reason: "{step.reason}"
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
