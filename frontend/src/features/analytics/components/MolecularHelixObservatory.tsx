import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dna,
  RotateCw,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  MoveHorizontal,
} from 'lucide-react';
import { ConceptInfo } from '../../../components/ConceptInfo';
import { samplesService } from '../../samples/samplesService';
import type { SampleListItem } from '../../samples/types';

interface Props {
  totalSamples?: number;
  onOpenSample?: (id: number) => void;
}

interface NucleotidePair {
  id: number;
  base1: 'A' | 'T' | 'G' | 'C';
  base2: 'A' | 'T' | 'G' | 'C';
  hBonds: 2 | 3;
  specimenCode: string;
  specimenType: string;
  sampleName: string;
  status: string;
  storage: string;
}

export const MolecularHelixObservatory: React.FC<Props> = ({
  totalSamples,
  onOpenSample,
}) => {
  const [selectedPair, setSelectedPair] = useState<NucleotidePair | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const isPointerDownRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const dragStartXRef = useRef(0);

  const [samples, setSamples] = useState<SampleListItem[]>([]);
  const [sampleError, setSampleError] = useState('');

  // Fetch the latest 12 registered specimens from the database
  useEffect(() => {
    let active = true;
    samplesService.listSamples({ pageSize: 12, sortBy: 'registered_at', sortDir: 'desc' })
      .then(data => { if (active) setSamples(data.items); })
      .catch(err => { if (active) setSampleError(err.message); });
    return () => { active = false; };
  }, [totalSamples]);

  const nucleotidePairs: NucleotidePair[] = useMemo(() => {
    const bases = ['A', 'G', 'T', 'C'] as const;
    const complement = { A: 'T', T: 'A', G: 'C', C: 'G' } as const;
    return samples.map((sample, index) => {
      const base = bases[index % bases.length];
      return {
        id: sample.sample_id,
        base1: base,
        base2: complement[base],
        hBonds: base === 'G' || base === 'C' ? 3 : 2,
        specimenCode: sample.sample_code,
        specimenType: sample.sample_type_code,
        sampleName: sample.sample_name,
        status: sample.sample_status,
        storage: sample.current_storage_location_code || 'Unassigned',
      };
    });
  }, [samples]);

  // Keep a specimen selected always (defaults to the first/latest record)
  useEffect(() => {
    if (nucleotidePairs.length > 0 && !selectedPair) {
      setSelectedPair(nucleotidePairs[0]);
    }
  }, [nucleotidePairs, selectedPair]);

  // Mouse / Pointer drag-to-rotate interaction handlers without swallowing clicks
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isPointerDownRef.current = true;
    hasDraggedRef.current = false;
    dragStartXRef.current = e.clientX;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    const deltaX = e.clientX - dragStartXRef.current;
    if (Math.abs(deltaX) > 3) {
      hasDraggedRef.current = true;
      setIsDragging(true);
    }
    dragStartXRef.current = e.clientX;
    setRotationAngle((prev) => (prev + deltaX * 0.012) % (Math.PI * 2));
  };

  const handlePointerUp = () => {
    isPointerDownRef.current = false;
    setIsDragging(false);
  };

  // Color map for base pairs
  const getBaseColor = (base: 'A' | 'T' | 'G' | 'C') => {
    switch (base) {
      case 'A': return '#2DD4BF'; // Teal
      case 'T': return '#F59E0B'; // Amber
      case 'G': return '#38BDF8'; // Cyan
      case 'C': return '#FB7185'; // Rose
    }
  };

  // Base full names
  const getBaseFullName = (base: 'A' | 'T' | 'G' | 'C') => {
    switch (base) {
      case 'A': return 'Adenine (Purine)';
      case 'T': return 'Thymine (Pyrimidine)';
      case 'G': return 'Guanine (Purine)';
      case 'C': return 'Cytosine (Pyrimidine)';
    }
  };

  // Math projection for 3D Helix
  const helixWidth = 860;
  const helixHeight = 260;
  const numSteps = nucleotidePairs.length;
  const ySpacing = (helixHeight - 50) / Math.max(1, numSteps - 1);
  const radius = 95; // 3D cylinder radius

  // Calculate 3D projected coordinates for each nucleotide rung
  const projectedRungs = useMemo(() => {
    return nucleotidePairs.map((pair, idx) => {
      const y = 30 + idx * ySpacing;
      // Pitch: 1.5 full helical turns across the 12 rungs
      const theta = rotationAngle + (idx / Math.max(1, numSteps)) * Math.PI * 3;

      // 3D coordinates (x = horizontal, z = depth into screen)
      const centerX = helixWidth / 2;
      const x1 = centerX + Math.cos(theta) * radius;
      const z1 = Math.sin(theta); // -1 to +1

      const x2 = centerX - Math.cos(theta) * radius;
      const z2 = -Math.sin(theta);

      // Depth sorting & perspective scale
      const scale1 = 0.75 + ((z1 + 1) / 2) * 0.55; // 0.75 to 1.3
      const scale2 = 0.75 + ((z2 + 1) / 2) * 0.55;

      const alpha1 = 0.35 + ((z1 + 1) / 2) * 0.65;
      const alpha2 = 0.35 + ((z2 + 1) / 2) * 0.65;

      return {
        pair,
        idx,
        y,
        x1,
        z1,
        scale1,
        alpha1,
        x2,
        z2,
        scale2,
        alpha2,
        avgZ: (z1 + z2) / 2,
      };
    });
  }, [nucleotidePairs, rotationAngle, ySpacing, numSteps]);

  // Generate continuous spline paths for the two sugar-phosphate backbones
  const strand1Path = useMemo(() => {
    if (projectedRungs.length === 0) return '';
    return projectedRungs.reduce((acc, r, i) => {
      return i === 0 ? `M ${r.x1} ${r.y}` : `${acc} L ${r.x1} ${r.y}`;
    }, '');
  }, [projectedRungs]);

  const strand2Path = useMemo(() => {
    if (projectedRungs.length === 0) return '';
    return projectedRungs.reduce((acc, r, i) => {
      return i === 0 ? `M ${r.x2} ${r.y}` : `${acc} L ${r.x2} ${r.y}`;
    }, '');
  }, [projectedRungs]);

  const selectRung = (pair: NucleotidePair) => {
    setSelectedPair(pair);
  };

  return (
    <div style={{
      borderRadius: 'var(--radius-card)',
      backgroundColor: '#070D1E',
      color: '#F8FAFC',
      border: '1px solid rgba(56, 189, 248, 0.28)',
      boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35)',
      overflow: 'hidden',
      marginBottom: '24px',
      position: 'relative',
    }}>
      {/* Background radial glow */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '20%',
        width: '60%',
        height: '120%',
        background: 'radial-gradient(circle, rgba(14, 165, 233, 0.07) 0%, rgba(99, 102, 241, 0.03) 60%, transparent 80%)',
        pointerEvents: 'none',
      }} />

      {/* Header bar */}
      <div style={{
        padding: '16px 22px',
        backgroundColor: 'rgba(11, 19, 41, 0.88)',
        borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            backgroundColor: 'rgba(14, 165, 233, 0.16)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(56, 189, 248, 0.2)',
          }}>
            <Dna size={20} color="#38BDF8" />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.01em' }}>
                BioTrace Molecular Core: Interactive Specimen DNA Helix
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#10B981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                LATEST 12 SPECIMENS
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
              Arranged from the 12 most recently registered specimen records in the database • Drag with mouse to rotate
            </div>
          </div>
        </div>

        <ConceptInfo title="Latest 12 Specimen Helix" steps={['Fetch latest 12 database records', 'Map one specimen per rung', 'Drag with mouse to rotate 3D view', 'Click rung to inspect specimen record']}>
          <p>This interactive 3D visualization presents the 12 most recently registered specimen records from the database. Click and drag horizontally with your mouse to rotate the helix. Click any rung to inspect the specimen record.</p>
        </ConceptInfo>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Single Orbit View Indicator */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            padding: '4px 10px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            fontSize: '11px',
            fontWeight: 600,
            color: '#38BDF8',
          }}>
            <RotateCw size={12} />
            <span>Orbit</span>
          </div>

          {isExpanded && (
            <>
              {/* Mouse Drag Hint */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                fontSize: '11px',
                color: '#CBD5E1',
              }}>
                <MoveHorizontal size={13} color="#38BDF8" />
                <span>Drag mouse to rotate</span>
              </div>

              {/* Reset View Button */}
              <button
                type="button"
                onClick={() => setRotationAngle(0)}
                style={{
                  padding: '4px 9px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(148, 163, 184, 0.1)',
                  color: '#94A3B8',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
                title="Reset rotation angle to default"
              >
                Reset
              </button>
            </>
          )}

          {/* Prominent Collapse / Expand Button */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              padding: '5px 12px',
              borderRadius: '8px',
              backgroundColor: isExpanded ? 'rgba(30, 41, 59, 0.85)' : 'rgba(14, 165, 233, 0.2)',
              color: isExpanded ? '#CBD5E1' : '#38BDF8',
              border: isExpanded ? '1px solid rgba(148, 163, 184, 0.3)' : '1px solid rgba(56, 189, 248, 0.45)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              transition: 'all 0.15s ease',
            }}
            title={isExpanded ? 'Collapse Specimen Helix view' : 'Expand Specimen Helix view'}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          </button>
        </div>
      </div>

      {/* Main Observatory Body */}
      {isExpanded && (
        <div style={{ padding: '16px 20px', position: 'relative' }}>
          {/* Informational Status Strip */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '14px',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            fontSize: '11px',
            color: '#94A3B8',
          }}>
            <div>
              Displaying <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>latest {numSteps} registered specimens</strong> from database
            </div>
            <div style={{ color: '#CBD5E1', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MoveHorizontal size={12} color="#38BDF8" />
              <span>Click and drag horizontally with mouse to rotate • Click any rung to view specimen dossier</span>
            </div>
          </div>

          {sampleError && <p role="alert" className="lab-error">{sampleError}</p>}
          {!sampleError && numSteps === 0 && <p style={{ color: '#CBD5E1' }}>No specimen rows to display.</p>}

          {/* SVG 3D Double Helix Render Canvas - Mouse Drag Controlled with Reliable Click Detection */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
              position: 'relative',
              overflow: 'hidden',
              textAlign: 'center',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              touchAction: 'none',
              borderRadius: '8px',
              backgroundColor: 'rgba(7, 13, 30, 0.4)',
              border: isDragging ? '1px dashed #38BDF8' : '1px solid rgba(148, 163, 184, 0.1)',
              transition: 'border 0.15s ease',
            }}
          >
            <svg
              viewBox={`0 0 ${helixWidth} ${helixHeight}`}
              style={{
                width: '100%',
                maxHeight: '280px',
                display: 'block',
                margin: '0 auto',
                filter: 'drop-shadow(0 0 16px rgba(14, 165, 233, 0.15))',
              }}
            >
              <defs>
                {/* Glow filter */}
                <filter id="helixGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* 5' to 3' and 3' to 5' Sugar-Phosphate Backbones */}
              <path
                d={strand1Path}
                fill="none"
                stroke="rgba(56, 189, 248, 0.45)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d={strand2Path}
                fill="none"
                stroke="rgba(129, 140, 248, 0.45)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Nucleotide Base Pair Rungs with 3D Depth Sorting */}
              {projectedRungs
                .slice()
                .sort((a, b) => a.avgZ - b.avgZ) // Render back-facing rungs first, front-facing last
                .map(({ pair, y, x1, scale1, alpha1, x2, scale2, alpha2 }) => {
                  const isSelected = selectedPair?.id === pair.id;
                  const color1 = getBaseColor(pair.base1);
                  const color2 = getBaseColor(pair.base2);

                  // Midpoint of the hydrogen bond
                  const midX = (x1 + x2) / 2;
                  const minX = Math.min(x1, x2);
                  const maxX = Math.max(x1, x2);

                  return (
                    <g
                      key={pair.id}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectRung(pair);
                      }}
                      onPointerUp={(e) => {
                        if (!hasDraggedRef.current) {
                          e.stopPropagation();
                          selectRung(pair);
                        }
                      }}
                    >
                      {/* Generous transparent hit-box line so clicking anywhere near the rung works easily */}
                      <line
                        x1={minX - 18}
                        y1={y}
                        x2={maxX + 18}
                        y2={y}
                        stroke="transparent"
                        strokeWidth="28"
                        cursor="pointer"
                      />

                      {/* Hydrogen Bond Connecting Line */}
                      <line
                        x1={x1}
                        y1={y}
                        x2={midX}
                        y2={y}
                        stroke={color1}
                        strokeWidth={isSelected ? 4.5 : 2.2}
                        strokeOpacity={isSelected ? 1 : alpha1}
                      />
                      <line
                        x1={midX}
                        y1={y}
                        x2={x2}
                        y2={y}
                        stroke={color2}
                        strokeWidth={isSelected ? 4.5 : 2.2}
                        strokeOpacity={isSelected ? 1 : alpha2}
                      />

                      {/* Hydrogen Bond Central Dot */}
                      <circle
                        cx={midX}
                        cy={y}
                        r={isSelected ? 4 : (pair.hBonds === 3 ? 3 : 2)}
                        fill="#FFFFFF"
                        fillOpacity={isSelected ? 1 : 0.8}
                      />

                      {/* Strand 1 Nucleotide Node */}
                      <circle
                        cx={x1}
                        cy={y}
                        r={isSelected ? 7.5 * scale1 : 6 * scale1}
                        fill={color1}
                        fillOpacity={isSelected ? 1 : alpha1}
                        stroke="#FFFFFF"
                        strokeWidth={isSelected ? 2.5 : 1}
                        filter={isSelected ? 'url(#helixGlow)' : undefined}
                      />

                      {/* Strand 1 Base Letter */}
                      {scale1 > 0.9 && (
                        <text
                          x={x1}
                          y={y + 3.5}
                          textAnchor="middle"
                          fill="#0F172A"
                          fontSize={9 * scale1}
                          fontWeight="800"
                          fontFamily="monospace"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {pair.base1}
                        </text>
                      )}

                      {/* Strand 2 Nucleotide Node */}
                      <circle
                        cx={x2}
                        cy={y}
                        r={isSelected ? 7.5 * scale2 : 6 * scale2}
                        fill={color2}
                        fillOpacity={isSelected ? 1 : alpha2}
                        stroke="#FFFFFF"
                        strokeWidth={isSelected ? 2.5 : 1}
                        filter={isSelected ? 'url(#helixGlow)' : undefined}
                      />

                      {/* Strand 2 Base Letter */}
                      {scale2 > 0.9 && (
                        <text
                          x={x2}
                          y={y + 3.5}
                          textAnchor="middle"
                          fill="#0F172A"
                          fontSize={9 * scale2}
                          fontWeight="800"
                          fontFamily="monospace"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {pair.base2}
                        </text>
                      )}

                      {/* Selection Callout Tag directly on the rung */}
                      {isSelected && (
                        <g
                          transform={`translate(${helixWidth - 215}, ${y - 12})`}
                          cursor="pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenSample) onOpenSample(pair.id);
                          }}
                        >
                          <rect
                            width="205"
                            height="24"
                            rx="5"
                            fill="#0F172A"
                            stroke="#38BDF8"
                            strokeWidth="1.5"
                          />
                          <text
                            x="10"
                            y="16"
                            fill="#38BDF8"
                            fontSize="10"
                            fontWeight="700"
                            fontFamily="monospace"
                          >
                            #{pair.id} · {pair.specimenCode} (Open) →
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
            </svg>
          </div>

          {/* Interactive Selected Specimen Dossier Card - SHOWN ALWAYS */}
          {selectedPair && (
            <div style={{
              marginTop: '14px',
              padding: '14px 18px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid #38BDF8',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(2, 132, 199, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              animation: 'fadeIn 0.2s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {/* Visual pair pill */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#0F172A',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  gap: '8px',
                }}>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: getBaseColor(selectedPair.base1), fontFamily: 'monospace' }}>
                    {selectedPair.base1}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                    {selectedPair.hBonds === 3 ? '≡' : '='}
                  </span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: getBaseColor(selectedPair.base2), fontFamily: 'monospace' }}>
                    {selectedPair.base2}
                  </span>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>
                      {selectedPair.sampleName}
                    </span>
                    <span className="badge badge-sand" style={{ fontSize: '10px', padding: '1px 6px' }}>
                      {selectedPair.specimenType}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                    Mapped Accession: <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>{selectedPair.specimenCode}</strong> • {selectedPair.hBonds} Hydrogen Bonds ({getBaseFullName(selectedPair.base1)} / {getBaseFullName(selectedPair.base2)})
                  </div>
                </div>
              </div>

              {/* Metrics & Jump Action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '11px', color: '#CBD5E1', display: 'flex', gap: '12px' }}>
                  <div>Status: <strong style={{ color: '#F8FAFC' }}>{selectedPair.status}</strong></div>
                  <div>Storage: <strong style={{ color: '#F8FAFC' }}>{selectedPair.storage}</strong></div>
                </div>

                {onOpenSample && (
                  <button
                    type="button"
                    onClick={() => onOpenSample(selectedPair.id)}
                    style={{
                      padding: '7px 15px',
                      borderRadius: '6px',
                      backgroundColor: '#0284C7',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
                      transition: 'background 0.15s ease',
                    }}
                    title={`Open complete laboratory dossier for specimen ${selectedPair.specimenCode}`}
                  >
                    <span>Open specimen dossier</span>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
