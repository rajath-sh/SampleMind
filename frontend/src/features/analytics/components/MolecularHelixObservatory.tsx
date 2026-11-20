import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dna,
  Play,
  Pause,
  RotateCw,
  Zap,
  Activity,
  Flame,
  ArrowRight,
  Maximize2,
  Minimize2,
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
  const [isPlaying, setIsPlaying] = useState(() => document.documentElement.dataset.motion !== "reduced" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [speed, setSpeed] = useState<number>(1.0);
  const [mode, setMode] = useState<'orbit' | 'scan' | 'denature'>('orbit');
  const [selectedPair, setSelectedPair] = useState<NucleotidePair | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [laserPos, setLaserPos] = useState<number>(0);
  const [denatureFactor, setDenatureFactor] = useState<number>(0); // 0 = annealed, 1 = fully separated

  // Animation frame loop state
  const [rotationAngle, setRotationAngle] = useState(0);
  const lastTimeRef = useRef<number>(performance.now());

  const [samples, setSamples] = useState<SampleListItem[]>([]);
  const [sampleError, setSampleError] = useState('');
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
        id: sample.sample_id, base1: base, base2: complement[base],
        hBonds: base === 'G' || base === 'C' ? 3 : 2,
        specimenCode: sample.sample_code, specimenType: sample.sample_type_code,
        sampleName: sample.sample_name, status: sample.sample_status,
        storage: sample.current_storage_location_code || 'Unassigned',
      };
    });
  }, [samples]);

  // 60FPS Animation Driver
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    lastTimeRef.current = performance.now();

    const animate = (time: number) => {
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      if (isPlaying) {
        setRotationAngle((prev) => (prev + delta * speed * 1.5) % (Math.PI * 2));

        // Scan laser sweep motion
        if (mode === 'scan') {
          setLaserPos((prev) => (prev + delta * 0.8) % 1);
        }

        // Thermal denaturation animation
        if (mode === 'denature') {
          const cycle = (Math.sin(time * 0.002) + 1) / 2;
          setDenatureFactor(cycle);
        } else {
          setDenatureFactor(0);
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, speed, mode]);

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
      const theta = rotationAngle + (idx / numSteps) * Math.PI * 3;

      // Separation factor for PCR denaturation simulation
      const strandSpread = 1 + denatureFactor * 1.6;

      // 3D coordinates (x = horizontal, z = depth into screen)
      const centerX = helixWidth / 2;
      const x1 = centerX + Math.cos(theta) * radius * strandSpread;
      const z1 = Math.sin(theta); // -1 to +1

      const x2 = centerX - Math.cos(theta) * radius * strandSpread;
      const z2 = -Math.sin(theta);

      // Depth sorting & perspective scale
      const scale1 = 0.75 + ((z1 + 1) / 2) * 0.55; // 0.75 to 1.3
      const scale2 = 0.75 + ((z2 + 1) / 2) * 0.55;

      const alpha1 = 0.35 + ((z1 + 1) / 2) * 0.65;
      const alpha2 = 0.35 + ((z2 + 1) / 2) * 0.65;

      // Check if this pair intersects with the scan laser
      const normalizedY = idx / (numSteps - 1);
      const isLaserHit = mode === 'scan' && Math.abs(normalizedY - laserPos) < 0.08;

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
        isLaserHit,
      };
    });
  }, [nucleotidePairs, rotationAngle, denatureFactor, mode, laserPos, ySpacing, numSteps]);

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
            <Dna size={20} color="#38BDF8" className={isPlaying ? 'animate-pulse' : ''} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.01em' }}>
                BioTrace Molecular Core: Interactive DNA Helix & Laboratory Activity
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
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981', animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
                SPECIMEN INVENTORY
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
              Recent specimen records arranged on an illustrative DNA helix
            </div>
          </div>
        </div>

        <ConceptInfo title="Helix specimen index" steps={['Order sample rows', 'Map one specimen per rung', 'Select a rung', 'Open specimen record']}>
          <p>Each rung opens a real specimen record from the SQL inventory. The base letters and DNA animation illustrate complementarity and denaturation.</p>
        </ConceptInfo>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Mode Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
          }}>
            <button
              type="button"
              onClick={() => setMode('orbit')}
              style={{
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                backgroundColor: mode === 'orbit' ? '#0284C7' : 'transparent',
                color: mode === 'orbit' ? '#FFFFFF' : '#94A3B8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.18s ease',
              }}
            >
              <RotateCw size={11} />
              Orbit
            </button>
            <button
              type="button"
              onClick={() => setMode('scan')}
              style={{
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                backgroundColor: mode === 'scan' ? '#0D9488' : 'transparent',
                color: mode === 'scan' ? '#FFFFFF' : '#94A3B8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.18s ease',
              }}
            >
              <Zap size={11} />
              Laser Scan
            </button>
            <button
              type="button"
              onClick={() => setMode('denature')}
              style={{
                padding: '4px 9px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                backgroundColor: mode === 'denature' ? '#DC2626' : 'transparent',
                color: mode === 'denature' ? '#FFFFFF' : '#94A3B8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.18s ease',
              }}
              title="Simulate 95°C Thermal PCR Strand Separation"
            >
              <Flame size={11} />
              PCR 95°C
            </button>
          </div>

          {/* Velocity Control */}
          <div style={{
            display: 'flex',
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
          }}>
            {[0.5, 1.0, 2.2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  backgroundColor: speed === s ? '#38BDF8' : 'transparent',
                  color: speed === s ? '#0F172A' : '#94A3B8',
                  transition: 'all 0.18s ease',
                }}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Play/Pause */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              backgroundColor: isPlaying ? 'rgba(56, 189, 248, 0.14)' : 'rgba(148, 163, 184, 0.1)',
              color: isPlaying ? '#38BDF8' : '#94A3B8',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
            }}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>

          {/* Collapse/Expand */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              padding: '6px 8px',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              color: '#94A3B8',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
            title={isExpanded ? 'Collapse Kinetic Helix' : 'Expand Kinetic Helix'}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Main Observatory Body */}
      {isExpanded && (
        <div style={{ padding: '16px 20px', position: 'relative' }}>
          {/* Top Real-time Scientific Telemetry Strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            marginBottom: '16px',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(148, 163, 184, 0.15)',
          }}>
            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                GC Equilibrium Content
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#38BDF8', fontFamily: 'monospace', marginTop: '2px' }}>
                52.8% (Balanced Isochore)
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Mean Phred Quality Score
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#34D399', fontFamily: 'monospace', marginTop: '2px' }}>
                Q40.8 (99.99% Accuracy)
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Active Simulation State
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: mode === 'denature' ? '#FB7185' : mode === 'scan' ? '#FBBF24' : '#818CF8', marginTop: '2px' }}>
                {mode === 'denature' ? `PCR Denaturation (${(denatureFactor * 100).toFixed(0)}% Open)` : mode === 'scan' ? 'Spectrometer Laser Scan' : 'Bioluminescent 3D Orbit'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Spectrophotometry Ratio
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC', fontFamily: 'monospace', marginTop: '2px' }}>
                Mapped records: {numSteps}
              </div>
            </div>
          </div>

          {sampleError && <p role="alert" className="lab-error">{sampleError}</p>}
          {!sampleError && numSteps === 0 && <p style={{ color: '#CBD5E1' }}>No specimen rows to display.</p>}
          {/* SVG 3D Double Helix Render Canvas */}
          <div style={{ position: 'relative', overflowX: 'auto', textAlign: 'center' }}>
            <svg
              viewBox={`0 0 ${helixWidth} ${helixHeight}`}
              style={{
                width: '100%',
                maxHeight: '280px',
                minWidth: '700px',
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

                {/* Laser scan gradient */}
                <linearGradient id="laserBeam" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0D9488" stopOpacity="0" />
                  <stop offset="50%" stopColor="#2DD4BF" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#0D9488" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Laser Spectrometer Beam (when scan mode active) */}
              {mode === 'scan' && (
                <g>
                  <line
                    x1="40"
                    y1={30 + laserPos * (helixHeight - 60)}
                    x2={helixWidth - 40}
                    y2={30 + laserPos * (helixHeight - 60)}
                    stroke="url(#laserBeam)"
                    strokeWidth="3.5"
                    filter="url(#helixGlow)"
                  />
                  <circle
                    cx={helixWidth / 2}
                    cy={30 + laserPos * (helixHeight - 60)}
                    r="6"
                    fill="#2DD4BF"
                    filter="url(#helixGlow)"
                  />
                </g>
              )}

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
                .map(({ pair, y, x1, scale1, alpha1, x2, scale2, alpha2, isLaserHit }) => {
                  const isSelected = selectedPair?.id === pair.id;
                  const color1 = getBaseColor(pair.base1);
                  const color2 = getBaseColor(pair.base2);

                  // Midpoint of the hydrogen bond
                  const midX = (x1 + x2) / 2;

                  return (
                    <g
                      key={pair.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedPair(pair)}
                    >
                      {/* Hydrogen Bond Connecting Line */}
                      <line
                        x1={x1}
                        y1={y}
                        x2={midX}
                        y2={y}
                        stroke={color1}
                        strokeWidth={isSelected ? 4 : isLaserHit ? 3.5 : 2.2}
                        strokeOpacity={alpha1}
                      />
                      <line
                        x1={midX}
                        y1={y}
                        x2={x2}
                        y2={y}
                        stroke={color2}
                        strokeWidth={isSelected ? 4 : isLaserHit ? 3.5 : 2.2}
                        strokeOpacity={alpha2}
                      />

                      {/* Hydrogen Bond Central Dot (2 vs 3 dots based on bond count) */}
                      {denatureFactor < 0.6 && (
                        <circle
                          cx={midX}
                          cy={y}
                          r={pair.hBonds === 3 ? 3 : 2}
                          fill="#FFFFFF"
                          fillOpacity={0.8}
                        />
                      )}

                      {/* Strand 1 Nucleotide Node */}
                      <circle
                        cx={x1}
                        cy={y}
                        r={6 * scale1}
                        fill={color1}
                        fillOpacity={alpha1}
                        stroke="#FFFFFF"
                        strokeWidth={isSelected ? 2 : 1}
                        filter={isLaserHit || isSelected ? 'url(#helixGlow)' : undefined}
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
                        r={6 * scale2}
                        fill={color2}
                        fillOpacity={alpha2}
                        stroke="#FFFFFF"
                        strokeWidth={isSelected ? 2 : 1}
                        filter={isLaserHit || isSelected ? 'url(#helixGlow)' : undefined}
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

                      {/* Hover/Selection Callout Tag */}
                      {isSelected && (
                        <g transform={`translate(${helixWidth - 190}, ${y - 12})`}>
                          <rect
                            width="180"
                            height="24"
                            rx="5"
                            fill="#1E293B"
                            stroke="#38BDF8"
                            strokeWidth="1.2"
                          />
                          <text
                            x="10"
                            y="16"
                            fill="#38BDF8"
                            fontSize="10"
                            fontWeight="700"
                            fontFamily="monospace"
                          >
                            Locus #{pair.id}: {pair.base1}≡{pair.base2} ({pair.specimenCode})
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
            </svg>
          </div>

          {/* Interactive Selected Nucleotide Locus Dossier Card */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ fontSize: '11px', color: '#CBD5E1', display: 'flex', gap: '12px' }}>
                  <div>Status <strong>{selectedPair.status}</strong></div>
                  <div>Storage <strong>{selectedPair.storage}</strong></div>
                </div>

                {onOpenSample && (
                  <button
                    type="button"
                    onClick={() => onOpenSample(selectedPair.id)}
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
                    Open specimen dossier
                    <ArrowRight size={12} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedPair(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '2px',
                  }}
                  title="Close specimen inspector"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Real-time Illumina Base Calls Ticker Stream */}
          <div style={{
            marginTop: '12px',
            padding: '8px 14px',
            backgroundColor: 'rgba(11, 19, 41, 0.7)',
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: '#94A3B8',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={12} color="#10B981" />
              <span>Illustrative base sequence</span>
              <span style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#38BDF8',
                letterSpacing: '0.12em',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}>
                5'-ATCGGCTAGGCTAAGCTTAGCG-3'
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span>Base Complementarity: <strong style={{ color: '#F8FAFC' }}>Watson-Crick Canonical</strong></span>
              <span>•</span>
              <span>Choose a rung to inspect its specimen record.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
