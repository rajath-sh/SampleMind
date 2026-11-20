import React, { useState, useEffect } from 'react';
import {
  Thermometer,
  RefreshCw,
  Info,
  Radio,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { CryoSpatialMapResponse, CryoWellSlot } from '../types';
import { samplesService } from '../samplesService';

interface Props {
  sampleId: number;
  onSelectSample?: (sampleId: number) => void;
}

export const SampleCryoSpatialMatrix: React.FC<Props> = ({ sampleId, onSelectSample }) => {
  const [data, setData] = useState<CryoSpatialMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredWell, setHoveredWell] = useState<CryoWellSlot | null>(null);
  const [selectedWell, setSelectedWell] = useState<CryoWellSlot | null>(null);
  const [viewMode, setViewMode] = useState<'status' | 'thermal'>('status');

  useEffect(() => {
    let isMounted = true;
    async function fetchPlate() {
      setLoading(true);
      setError(null);
      try {
        const res = await samplesService.getCryoSpatialMap(sampleId);
        if (isMounted) {
          setData(res);
          // Set focal well as initial selected well
          const focal = res.wells.find((w) => w.is_focal);
          if (focal) setSelectedWell(focal);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load cryogenic spatial coordinate matrix.';
          setError(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchPlate();
    return () => {
      isMounted = false;
    };
  }, [sampleId]);

  if (loading) {
    return (
      <div style={{
        padding: '36px',
        textAlign: 'center',
        backgroundColor: '#0B1329',
        borderRadius: 'var(--radius-card)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        color: '#F8FAFC',
      }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: '#38BDF8' }} />
        <div style={{ fontSize: '13px', color: '#94A3B8' }}>
          Querying cryogenic freezer telemetry and 96-well microplate coordinates...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        padding: '16px',
        backgroundColor: '#1E1B4B',
        borderRadius: 'var(--radius-card)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#F87171',
        fontSize: '12px',
      }}>
        <Info size={16} style={{ verticalAlign: '-3px', marginRight: '6px' }} />
        {error || 'Unable to retrieve cryogenic plate matrix.'}
      </div>
    );
  }

  const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const colNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const baseTemp = data.temperature_celsius || -80.0;

  // Compute thermal gradient for any well coordinate (inner wells are slightly colder, outer wells nearer front door seal)
  const getWellTemperature = (rowIdx: number, colIdx: number) => {
    // Row 0-7, Col 0-11
    // Distance from center (3.5, 5.5)
    const dist = Math.sqrt(Math.pow(rowIdx - 3.5, 2) + Math.pow(colIdx - 5.5, 2));
    // Core is around baseTemp - 2.5°C, periphery is baseTemp + 2.0°C
    const tempDelta = (dist / 6.5) * 4.5 - 2.5;
    return Number((baseTemp + tempDelta).toFixed(1));
  };

  const getStatusWellStyle = (well: CryoWellSlot, rowIdx: number, colIdx: number) => {
    const isFocal = well.is_focal;
    const isSelected = selectedWell?.slot_code === well.slot_code;

    if (viewMode === 'thermal') {
      const t = getWellTemperature(rowIdx, colIdx);
      // Cold range: -83°C (ultramarine) to -77°C (cyan)
      const ratio = Math.max(0, Math.min(1, (t - (-83)) / 6)); // 0 = very cold, 1 = slightly warmer
      const bg = `radial-gradient(circle, ${ratio < 0.5 ? '#1E3A8A' : '#0369A1'} 30%, ${ratio < 0.5 ? '#0F172A' : '#075985'} 100%)`;
      const border = isSelected ? '2px solid #FBBF24' : isFocal ? '2px solid #38BDF8' : '1px solid rgba(56, 189, 248, 0.4)';
      const shadow = isSelected ? '0 0 14px rgba(251, 191, 36, 0.8)' : isFocal ? '0 0 10px rgba(56, 189, 248, 0.7)' : 'none';
      return { background: bg, border, boxShadow: shadow };
    }

    if (isFocal) {
      return {
        background: 'radial-gradient(circle, #38BDF8 30%, #0284C7 100%)',
        border: '2px solid #FFFFFF',
        boxShadow: isSelected ? '0 0 16px rgba(255, 255, 255, 0.9)' : '0 0 12px rgba(56, 189, 248, 0.8)',
      };
    }

    if (isSelected) {
      return {
        background: 'radial-gradient(circle, #FBBF24 30%, #D97706 100%)',
        border: '2px solid #FFFFFF',
        boxShadow: '0 0 14px rgba(251, 191, 36, 0.85)',
      };
    }

    const s = (well.sample_status || '').toUpperCase();
    if (s === 'IN_STORAGE' || s === 'AVAILABLE') {
      return {
        background: 'radial-gradient(circle, #34D399 20%, #059669 100%)',
        border: '1px solid rgba(52, 211, 153, 0.6)',
        boxShadow: '0 0 6px rgba(52, 211, 153, 0.3)',
      };
    }
    if (s === 'IN_USE') {
      return {
        background: 'radial-gradient(circle, #FBBF24 20%, #D97706 100%)',
        border: '1px solid rgba(251, 191, 36, 0.6)',
        boxShadow: '0 0 6px rgba(251, 191, 36, 0.3)',
      };
    }
    if (s === 'QUARANTINED') {
      return {
        background: 'radial-gradient(circle, #A78BFA 20%, #7C3AED 100%)',
        border: '1px solid rgba(167, 139, 250, 0.6)',
        boxShadow: '0 0 6px rgba(167, 139, 250, 0.3)',
      };
    }
    if (s === 'DEPLETED' || s === 'DISPOSED') {
      return {
        background: 'radial-gradient(circle, #64748B 20%, #334155 100%)',
        border: '1px solid rgba(100, 116, 139, 0.4)',
        boxShadow: 'none',
      };
    }

    return {
      background: 'transparent',
      border: '1px dashed rgba(148, 163, 184, 0.25)',
      boxShadow: 'none',
    };
  };

  const activeInspectSlot = hoveredWell || selectedWell;

  return (
    <div style={{
      borderRadius: 'var(--radius-card)',
      backgroundColor: '#070D1E',
      color: '#F8FAFC',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      boxShadow: '0 8px 28px rgba(0, 0, 0, 0.35)',
      overflow: 'hidden',
      marginBottom: '20px',
      position: 'relative',
    }}>
      {/* Dynamic Keyframes for Sonar and Ping */}
      <style>{`
        @keyframes sonarPing {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.85);
          }
          70% {
            transform: scale(1.18);
            box-shadow: 0 0 0 14px rgba(56, 189, 248, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(56, 189, 248, 0);
          }
        }
        @keyframes sonarRadarSweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .focal-well-pulse {
          animation: sonarPing 1.8s infinite ease-in-out;
        }
        .cryo-well-item {
          transition: transform 0.15s ease, filter 0.15s ease;
        }
        .cryo-well-item:hover {
          transform: scale(1.22);
          z-index: 20;
          filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.9));
        }
      `}</style>

      {/* Sensor & Telemetry Header Bar */}
      <div style={{
        padding: '14px 20px',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            backgroundColor: 'rgba(56, 189, 248, 0.16)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(56, 189, 248, 0.25)',
          }}>
            <Radio size={18} color="#38BDF8" className="animate-pulse" />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC' }}>
                Spatial Cryo-Rack Microplate Matrix (8 × 12 = 96 Wells)
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: '#38BDF8',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                fontFamily: 'monospace',
              }}>
                Focal Coordinate: {data.focal_slot_code}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
              Physical Unit: <strong style={{ color: '#F8FAFC' }}>{data.location_code}</strong> ({data.unit_label || data.unit_type}) • Facility: {data.facility} {data.room ? `(${data.room})` : ''} • Rack: {data.rack || '01'} • Box: {data.box || '01'}
            </div>
          </div>
        </div>

        {/* View Mode & Sensor Telemetry */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Temperature Sensor Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(30, 41, 59, 0.75)',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            fontSize: '11px',
          }}>
            <Thermometer size={14} color="#38BDF8" />
            <span style={{ color: '#94A3B8' }}>Sensor Temp:</span>
            <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>
              {baseTemp.toFixed(1)}°C
            </strong>
            <span style={{ color: '#64748B' }}>({(baseTemp + 273.15).toFixed(1)} K)</span>
          </div>

          {/* Mode Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            padding: '2px',
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
          }}>
            <button
              type="button"
              onClick={() => setViewMode('status')}
              style={{
                padding: '3px 9px',
                fontSize: '10px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: viewMode === 'status' ? '#0284C7' : 'transparent',
                color: viewMode === 'status' ? '#FFFFFF' : '#94A3B8',
                transition: 'all 0.15s ease',
              }}
            >
              Status Caps
            </button>
            <button
              type="button"
              onClick={() => setViewMode('thermal')}
              style={{
                padding: '3px 9px',
                fontSize: '10px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: viewMode === 'thermal' ? '#0D9488' : 'transparent',
                color: viewMode === 'thermal' ? '#FFFFFF' : '#94A3B8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                transition: 'all 0.15s ease',
              }}
            >
              <Flame size={11} />
              Thermal Map
            </button>
          </div>
        </div>
      </div>

      {/* Main Microplate Grid Area */}
      <div style={{ padding: '18px 24px', overflowX: 'auto' }}>
        <div style={{ minWidth: '780px', margin: '0 auto' }}>
          {/* Column Number Labels (01 to 12) */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px repeat(12, 1fr)', gap: '6px', marginBottom: '6px' }}>
            <div />
            {colNumbers.map((c) => {
              const isColActive = activeInspectSlot?.col_label === c;
              return (
                <div
                  key={c}
                  style={{
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: isColActive ? '#38BDF8' : '#64748B',
                    transition: 'color 0.15s ease',
                  }}
                >
                  {String(c).padStart(2, '0')}
                </div>
              );
            })}
          </div>

          {/* Rows A through H */}
          {rowLetters.map((rowLetter, rowIdx) => {
            const isRowActive = activeInspectSlot?.row_label === rowLetter;
            return (
              <div
                key={rowLetter}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px repeat(12, 1fr)',
                  gap: '6px',
                  marginBottom: '6px',
                  alignItems: 'center',
                }}
              >
                {/* Row Header */}
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    color: isRowActive ? '#38BDF8' : '#64748B',
                    transition: 'color 0.15s ease',
                  }}
                >
                  {rowLetter}
                </div>

                {/* 12 Wells per row */}
                {colNumbers.map((colNum, colIdx) => {
                  const slotCode = `${rowLetter}-${String(colNum).padStart(2, '0')}`;
                  const well = data.wells.find((w) => w.slot_code === slotCode) || {
                    row_label: rowLetter,
                    col_label: colNum,
                    slot_code: slotCode,
                    is_focal: false,
                    is_occupied: false,
                  };

                  const isFocal = well.is_focal;
                  const isSelected = selectedWell?.slot_code === well.slot_code;
                  const style = getStatusWellStyle(well, rowIdx, colIdx);

                  return (
                    <div
                      key={slotCode}
                      className={`cryo-well-item ${isFocal ? 'focal-well-pulse' : ''}`}
                      style={{
                        aspectRatio: '1 / 1',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        ...style,
                      }}
                      onMouseEnter={() => setHoveredWell(well)}
                      onMouseLeave={() => setHoveredWell(null)}
                      onClick={() => setSelectedWell(well)}
                    >
                      {/* Inner Frosted Cap Core */}
                      <div style={{
                        width: '38%',
                        height: '38%',
                        borderRadius: '50%',
                        backgroundColor: isFocal ? '#FFFFFF' : isSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)',
                        boxShadow: isFocal || isSelected ? '0 0 6px rgba(255, 255, 255, 0.9)' : 'none',
                      }} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Active Well Telemetry Inspector */}
      {activeInspectSlot && (
        <div style={{
          padding: '12px 20px',
          backgroundColor: 'rgba(15, 23, 42, 0.98)',
          borderTop: '1px solid #38BDF8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: activeInspectSlot.is_focal ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.9)',
              border: `1px solid ${activeInspectSlot.is_focal ? '#38BDF8' : 'rgba(148, 163, 184, 0.3)'}`,
              fontFamily: 'monospace',
              fontSize: '13px',
              fontWeight: 800,
              color: activeInspectSlot.is_focal ? '#38BDF8' : '#F8FAFC',
            }}>
              {activeInspectSlot.slot_code}
            </div>

            <div>
              {activeInspectSlot.is_occupied ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>
                      {activeInspectSlot.sample_name || activeInspectSlot.sample_code}
                    </span>
                    <span className="badge badge-sand" style={{ fontSize: '10px', padding: '1px 6px' }}>
                      {activeInspectSlot.sample_type_code}
                    </span>
                    <span className="badge badge-success" style={{ fontSize: '10px', padding: '1px 6px' }}>
                      {activeInspectSlot.sample_status}
                    </span>
                    {activeInspectSlot.is_focal && (
                      <span className="badge badge-neutral font-mono" style={{ fontSize: '10px', color: '#38BDF8' }}>
                        ★ Active Dossier Target
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                    Specimen Code: <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>{activeInspectSlot.sample_code}</strong> • Remaining Quantity: <strong style={{ color: '#34D399', fontFamily: 'monospace' }}>{activeInspectSlot.quantity_value?.toFixed(1)} {activeInspectSlot.quantity_unit || 'mg'}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8' }}>
                    Empty Cryogenic Slot (Vacuum Reserved)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    Available for atomic derivation child aliquot or accession placement
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeInspectSlot.is_occupied && activeInspectSlot.sample_id && onSelectSample && (
              <button
                type="button"
                onClick={() => onSelectSample(activeInspectSlot.sample_id!)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#0284C7',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Inspect Specimen Dossier
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Legend & Telemetry Bar */}
      <div style={{
        padding: '10px 20px',
        backgroundColor: 'rgba(11, 19, 41, 0.95)',
        borderTop: '1px solid rgba(148, 163, 184, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: '#94A3B8',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <span><strong>Legend:</strong></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#38BDF8', boxShadow: '0 0 6px #38BDF8' }} />
            Focal Specimen Target
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#34D399' }} />
            Available Specimen
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#FBBF24' }} />
            In Use / Processing
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#A78BFA' }} />
            Quarantined
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: '1px dashed #64748B' }} />
            Empty Slot
          </span>
        </div>

        <div>
          <span>Box Occupancy: <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>{data.occupied_slots} / {data.total_slots} ({data.occupancy_pct.toFixed(1)}%)</strong></span>
        </div>
      </div>
    </div>
  );
};
