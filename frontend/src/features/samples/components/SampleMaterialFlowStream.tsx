import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GitMerge,
  RefreshCw,
  Play,
  Pause,
  Layers,
  Activity,
  ArrowRight,
  Filter,
  X,
} from 'lucide-react';
import { MaterialFlowResponse, MaterialFlowNode } from '../types';
import { samplesService } from '../samplesService';

interface Props {
  onSelectDestination?: (status: string) => void;
  onSelectSampleType?: (typeCode: string) => void;
}

export const SampleMaterialFlowStream: React.FC<Props> = ({
  onSelectDestination,
  onSelectSampleType,
}) => {
  const [data, setData] = useState<MaterialFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<any | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [animateParticles, setAnimateParticles] = useState(true);
  const [speedMode, setSpeedMode] = useState<'laminar' | 'standard' | 'kinetic'>('standard');
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  const fetchFlow = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const res = await samplesService.getMaterialFlow();
      setData(res);
      setLastSyncTime(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load material transformation flow.';
      setError(msg);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchFlow(false);
  }, [fetchFlow]);

  // Live Auto-Refresh Heartbeat (every 12 seconds when autoSync is true)
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      fetchFlow(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [autoSync, fetchFlow]);

  // Geometry calculations for SVG Alluvial layout
  const layout = useMemo(() => {
    if (!data || !data.nodes || data.nodes.length === 0) return null;

    const sources = data.nodes.filter((n) => n.category === 'source');
    const transformations = data.nodes.filter((n) => n.category === 'transformation');
    const destinations = data.nodes.filter((n) => n.category === 'destination');

    const colX = {
      source: 45,
      transformation: 375,
      destination: 715,
    };
    const nodeWidth = 145;
    const svgHeight = 370;
    const topMargin = 45;
    const usableHeight = svgHeight - topMargin - 25;

    const nodePosMap = new Map<string, { x: number; y: number; width: number; height: number; node: MaterialFlowNode }>();

    const layoutColumn = (items: MaterialFlowNode[], x: number) => {
      const count = items.length || 1;
      const spacing = 10;
      const totalSpacing = (count - 1) * spacing;
      const availableH = usableHeight - totalSpacing;
      const nodeH = Math.min(36, Math.max(22, availableH / count));

      const totalH = count * nodeH + totalSpacing;
      let startY = topMargin + (usableHeight - totalH) / 2;

      items.forEach((item) => {
        nodePosMap.set(item.id, {
          x,
          y: startY,
          width: nodeWidth,
          height: nodeH,
          node: item,
        });
        startY += nodeH + spacing;
      });
    };

    layoutColumn(sources, colX.source);
    layoutColumn(transformations, colX.transformation);
    layoutColumn(destinations, colX.destination);

    // Compute curved ribbon paths
    const paths = data.links.map((link, idx) => {
      const srcPos = nodePosMap.get(link.source_id);
      const tgtPos = nodePosMap.get(link.target_id);

      if (!srcPos || !tgtPos) return null;

      const x0 = srcPos.x + srcPos.width;
      const y0 = srcPos.y + srcPos.height / 2;
      const x1 = tgtPos.x;
      const y1 = tgtPos.y + tgtPos.height / 2;

      const dx = (x1 - x0) * 0.5;
      const pathD = `M ${x0} ${y0} C ${x0 + dx} ${y0}, ${x1 - dx} ${y1}, ${x1} ${y1}`;

      // Max stroke thickness normalized between 2.5px and 14px
      const strokeWidth = Math.max(2.5, Math.min(14, (link.flow_volume / 100) * 8.5));

      return {
        id: `link-${idx}`,
        source_id: link.source_id,
        target_id: link.target_id,
        pathD,
        strokeWidth,
        flow_volume: link.flow_volume,
        sample_count: link.sample_count,
        label: link.flow_label,
        sourceNode: srcPos.node,
        targetNode: tgtPos.node,
        midX: (x0 + x1) / 2,
        midY: (y0 + y1) / 2,
      };
    }).filter(Boolean);

    return {
      nodePosMap,
      paths,
      sources,
      transformations,
      destinations,
    };
  }, [data]);

  // Animation velocity multiplier
  const animDuration = speedMode === 'laminar' ? '3.6s' : speedMode === 'kinetic' ? '0.9s' : '1.8s';

  if (loading && !data) {
    return (
      <div style={{
        padding: '36px',
        textAlign: 'center',
        backgroundColor: '#0F172A',
        borderRadius: 'var(--radius-card)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        color: '#F8FAFC',
      }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: '#38BDF8' }} />
        <div style={{ fontSize: '13px', color: '#94A3B8' }}>
          Synthesizing real-time biological mass balance & transformation flows...
        </div>
      </div>
    );
  }

  if (error || !data || !layout) {
    return (
      <div style={{
        padding: '16px',
        backgroundColor: '#1E1B4B',
        borderRadius: 'var(--radius-card)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#F87171',
        fontSize: '12px',
      }}>
        {error || 'Unable to compute material flow graph.'}
      </div>
    );
  }

  const activeFocusNode = selectedNode || hoveredNode;
  const activeFocusLink = selectedLink ? selectedLink.id : hoveredLink;

  return (
    <div style={{
      borderRadius: 'var(--radius-card)',
      backgroundColor: '#090E1A',
      color: '#F8FAFC',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
      overflow: 'hidden',
      position: 'relative',
      marginBottom: '20px',
    }}>
      {/* Keyframes for fluid wave animations */}
      <style>{`
        @keyframes streamWavePulse {
          0% { stroke-dashoffset: 80; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes orbGlowPulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .stream-ribbon {
          transition: stroke-width 0.2s ease, stroke-opacity 0.2s ease, filter 0.2s ease;
        }
        .stream-ribbon:hover {
          filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.8));
        }
      `}</style>

      {/* Header bar */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            backgroundColor: 'rgba(14, 165, 233, 0.18)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(56, 189, 248, 0.25)',
          }}>
            <GitMerge size={18} color="#38BDF8" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.01em' }}>
                Biological Material Derivation & Transformation Alluvial Stream
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
                LIVE STREAM
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
              Real-time mass balance: Accession Origins → Biochemical Operations → Active Storage Disposition • Synced {lastSyncTime.toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Telemetry and Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Live database metrics badge */}
          <div style={{
            fontSize: '11px',
            color: '#CBD5E1',
            backgroundColor: 'rgba(30, 41, 59, 0.75)',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            display: 'flex',
            gap: '8px',
          }}>
            <span>Total Volume: <strong style={{ color: '#38BDF8', fontFamily: 'monospace' }}>{data.total_volume_processed.toFixed(1)} units</strong></span>
            <span>•</span>
            <span>Derivations: <strong style={{ color: '#34D399', fontFamily: 'monospace' }}>{data.total_transformations}</strong></span>
          </div>

          {/* Velocity Control */}
          <div style={{
            display: 'flex',
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            padding: '2px',
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
          }}>
            {(['laminar', 'standard', 'kinetic'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSpeedMode(mode)}
                style={{
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: speedMode === mode ? '#0284C7' : 'transparent',
                  color: speedMode === mode ? '#FFFFFF' : '#94A3B8',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s ease',
                }}
              >
                {mode === 'laminar' ? 'Calm' : mode === 'kinetic' ? 'Burst' : 'Standard'}
              </button>
            ))}
          </div>

          {/* Animation Play/Pause */}
          <button
            type="button"
            onClick={() => setAnimateParticles(!animateParticles)}
            style={{
              padding: '5px 9px',
              fontSize: '11px',
              backgroundColor: animateParticles ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: animateParticles ? '#38BDF8' : '#94A3B8',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
            title={animateParticles ? 'Pause particle wave' : 'Resume particle wave'}
          >
            {animateParticles ? <Pause size={12} /> : <Play size={12} />}
          </button>

          {/* Live Auto-Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoSync(!autoSync)}
            style={{
              padding: '5px 9px',
              fontSize: '11px',
              backgroundColor: autoSync ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              color: autoSync ? '#10B981' : '#94A3B8',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
            title={autoSync ? 'Live auto-sync active (12s interval)' : 'Auto-sync paused'}
          >
            <Activity size={12} />
            <span>{autoSync ? 'Auto-Sync' : 'Manual'}</span>
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={() => fetchFlow(false)}
            style={{
              padding: '5px 9px',
              fontSize: '11px',
              backgroundColor: 'transparent',
              color: '#94A3B8',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
            title="Refresh material flow telemetry"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div style={{ position: 'relative', overflowX: 'auto', padding: '10px 0' }}>
        <svg
          viewBox="0 0 940 370"
          style={{ width: '100%', minWidth: '880px', height: '370px', display: 'block' }}
        >
          <defs>
            {/* Gradients for ribbons */}
            {layout.paths.map((p, i) => {
              if (!p) return null;
              return (
                <linearGradient key={`grad-${i}`} id={`streamGrad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={p.sourceNode.color} stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#818CF8" stopOpacity="0.85" />
                  <stop offset="100%" stopColor={p.targetNode.color} stopOpacity="0.8" />
                </linearGradient>
              );
            })}

            <filter id="streamGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="glow" />
              <feComposite in="SourceGraphic" in2="glow" operator="over" />
            </filter>
          </defs>

          {/* Column Header Titles */}
          <text x="45" y="24" fill="#94A3B8" fontSize="11" fontWeight="700" letterSpacing="0.06em">
            STAGE 1: BIOLOGICAL ACCESSION ORIGINS
          </text>
          <text x="375" y="24" fill="#94A3B8" fontSize="11" fontWeight="700" letterSpacing="0.06em">
            STAGE 2: BIOCHEMICAL TRANSFORMATION
          </text>
          <text x="715" y="24" fill="#94A3B8" fontSize="11" fontWeight="700" letterSpacing="0.06em">
            STAGE 3: CURRENT INVENTORY DISPOSITION
          </text>

          {/* Flow Ribbons */}
          {layout.paths.map((p, idx) => {
            if (!p) return null;
            const isHovered = hoveredLink === p.id;
            const isSelected = selectedLink?.id === p.id;
            const isRelated = activeFocusNode === p.source_id || activeFocusNode === p.target_id;

            const isFocused = isHovered || isSelected || isRelated;
            const anyFocusActive = Boolean(activeFocusNode || activeFocusLink);

            const opacity = anyFocusActive ? (isFocused ? 0.95 : 0.08) : 0.42;
            const strokeW = isFocused ? p.strokeWidth + 3.5 : p.strokeWidth;
            const filterEffect = isFocused ? 'url(#streamGlow)' : undefined;

            return (
              <g key={p.id}>
                {/* Background flow ribbon */}
                <path
                  d={p.pathD}
                  fill="none"
                  stroke={`url(#streamGrad-${idx})`}
                  strokeWidth={strokeW}
                  strokeOpacity={opacity}
                  className="stream-ribbon"
                  filter={filterEffect}
                  cursor="pointer"
                  onMouseEnter={() => setHoveredLink(p.id)}
                  onMouseLeave={() => setHoveredLink(null)}
                  onClick={() => setSelectedLink(selectedLink?.id === p.id ? null : p)}
                />

                {/* Animated fluid wave dashed line overlay */}
                {animateParticles && (
                  <path
                    d={p.pathD}
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={Math.max(1.8, p.strokeWidth * 0.35)}
                    strokeDasharray="8, 20"
                    strokeOpacity={isFocused ? 0.95 : 0.3}
                    style={{
                      animation: `streamWavePulse ${animDuration} linear infinite`,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {Array.from(layout.nodePosMap.values()).map(({ x, y, width, height, node }) => {
            const isNodeHovered = hoveredNode === node.id;
            const isNodeSelected = selectedNode === node.id;
            const isDest = node.category === 'destination';
            const isSource = node.category === 'source';

            return (
              <g
                key={node.id}
                transform={`translate(${x}, ${y})`}
                cursor="pointer"
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => {
                  setSelectedNode(selectedNode === node.id ? null : node.id);
                  if (isDest && onSelectDestination) {
                    const statusKey = node.id.replace('dest_', '');
                    onSelectDestination(statusKey);
                  } else if (isSource && onSelectSampleType) {
                    const typeKey = node.id.replace('src_', '');
                    onSelectSampleType(typeKey);
                  }
                }}
              >
                {/* Node Box */}
                <rect
                  width={width}
                  height={height}
                  rx="6"
                  ry="6"
                  fill="#111C33"
                  stroke={isNodeSelected ? '#FBBF24' : isNodeHovered ? '#38BDF8' : node.color}
                  strokeWidth={isNodeSelected || isNodeHovered ? 2.2 : 1.2}
                  filter={isNodeHovered || isNodeSelected ? 'url(#streamGlow)' : undefined}
                  style={{ transition: 'all 0.18s ease' }}
                />

                {/* Left accent color bar */}
                <rect
                  x="0"
                  y="0"
                  width="4"
                  height={height}
                  rx="2"
                  fill={node.color}
                />

                {/* Node Label */}
                <text
                  x="10"
                  y={height / 2 + 4}
                  fill="#F8FAFC"
                  fontSize="11"
                  fontWeight="600"
                  letterSpacing="-0.01em"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}
                </text>

                {/* Node Metric Badge */}
                <text
                  x={width - 8}
                  y={height / 2 + 4}
                  textAnchor="end"
                  fill={node.color}
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="monospace"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {node.sample_count}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip when a ribbon is hovered */}
        {hoveredLink && !selectedLink && (() => {
          const hoveredObj = layout.paths.find((p) => p?.id === hoveredLink);
          if (!hoveredObj) return null;
          return (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '24px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid #38BDF8',
              borderRadius: '8px',
              padding: '8px 14px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              fontSize: '11px',
              color: '#F8FAFC',
              pointerEvents: 'none',
              zIndex: 10,
              maxWidth: '320px',
            }}>
              <div style={{ fontWeight: 700, color: '#38BDF8', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Layers size={12} />
                <span>{hoveredObj.label}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#CBD5E1' }}>
                <span>Transfer Volume:</span>
                <strong style={{ fontFamily: 'monospace', color: '#34D399' }}>{hoveredObj.flow_volume.toFixed(1)} units</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#CBD5E1' }}>
                <span>Derived Samples:</span>
                <strong style={{ fontFamily: 'monospace', color: '#F8FAFC' }}>{hoveredObj.sample_count} aliquot(s)</strong>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Interactive Selected Stream Channel Inspector Bar */}
      {selectedLink && (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid #38BDF8',
              fontSize: '11px',
              fontWeight: 700,
              color: '#38BDF8',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <Layers size={13} />
              <span>ACTIVE FLOW CHANNEL</span>
            </div>

            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>
                {selectedLink.sourceNode.label} <ArrowRight size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> {selectedLink.targetNode.label}
              </div>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                Cumulative Volume: <strong style={{ color: '#34D399', fontFamily: 'monospace' }}>{selectedLink.flow_volume.toFixed(1)} units</strong> • Aliquots derived: <strong style={{ color: '#F8FAFC' }}>{selectedLink.sample_count}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {selectedLink.targetNode.category === 'destination' && onSelectDestination && (
              <button
                type="button"
                onClick={() => {
                  const statusKey = selectedLink.targetNode.id.replace('dest_', '');
                  onSelectDestination(statusKey);
                }}
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
                <Filter size={11} />
                Filter Table by '{selectedLink.targetNode.label}'
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedLink(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '4px',
                display: 'inline-flex',
              }}
              title="Clear selection"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Legend & interaction hint */}
      <div style={{
        padding: '8px 20px',
        borderTop: '1px solid rgba(148, 163, 184, 0.1)',
        backgroundColor: 'rgba(9, 14, 26, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: '#94A3B8',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span><strong>Legend:</strong></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3B82F6' }} />
            Primary Specimen Types
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0D9488' }} />
            Biochemical Transformation
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
            Storage Disposition
          </span>
        </div>
        <div>
          <span>Tip: Click any <strong>ribbon stream</strong> or <strong>destination node</strong> to isolate and inspect channels.</span>
        </div>
      </div>
    </div>
  );
};
