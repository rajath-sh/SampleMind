import { DatabaseConcept } from '../../components/DatabaseConcept';
import { CompactTable } from '../../components/CompactTable';
import { useAuth } from '../auth/AuthContext';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GitFork,
  Search,
  RefreshCw,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowRight,
  ArrowDown,
  X,
  AlertCircle,
  CheckCircle2,
  Table as TableIcon,
  Layers,
  Sparkles,
  Trash2,
  ArrowLeftRight,
} from 'lucide-react';
import { lineageService } from './lineageService';
import { samplesService } from '../samples/samplesService';
import { LineageGraphResponse, LineageNodeItem, RelationshipCreatePayload } from './types';
import { SampleListItem } from '../samples/types';

export const LineageExplorerPage: React.FC<{ initialSampleId?: number }> = ({ initialSampleId }) => {
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'RESEARCHER';
  const [samplesList, setSamplesList] = useState<SampleListItem[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(initialSampleId ?? null);
  const [direction, setDirection] = useState<'all' | 'upstream' | 'downstream'>('all');
  const [maxDepth] = useState<number>(5);
  const [layoutMode, setLayoutMode] = useState<'LR' | 'TB'>('LR');
  const [viewMode, setViewMode] = useState<'canvas' | 'table'>('canvas');
  const [tableTab, setTableTab] = useState<'nodes' | 'edges'>('nodes');

  // Graph state
  const [graphData, setGraphData] = useState<LineageGraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inspector Drawer state
  const [inspectedNode, setInspectedNode] = useState<LineageNodeItem | null>(null);

  // Zoom / Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Add Relationship Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [linkForm, setLinkForm] = useState<RelationshipCreatePayload>({
    parent_sample_id: 252,
    child_sample_id: 1,
    transformation_type: 'DNA Extraction',
    quantity_transferred: undefined,
    quantity_unit: 'mg',
    notes: '',
  });

  // Modal search filters for parent/child pickers
  // After creating link, switch tree root to the parent?
  const [switchTreeAfterCreate, setSwitchTreeAfterCreate] = useState(true);

  // Load sample catalog — fetch ALL specimens across all pages with resilient fallback
  useEffect(() => {
    let current = true;
    async function loadSamples() {
      try {
        // Try fetching with pageSize 100 first, which is accepted by older and newer schema validations
        const first = await samplesService.listSamples({ pageSize: 100, sortBy: 'sample_id', sortDir: 'asc', page: 1 });
        if (!current) return;
        let all = [...(first.items || [])];

        if (first.total > all.length) {
          const totalPages = Math.ceil(first.total / 100);
          const extraFetches = Array.from({ length: totalPages - 1 }, (_, i) =>
            samplesService.listSamples({ pageSize: 100, page: i + 2, sortBy: 'sample_id', sortDir: 'asc' }).catch(() => ({ items: [], total: 0, page: i + 2, page_size: 100, total_pages: 0 }))
          );
          const extraResults = await Promise.all(extraFetches);
          for (const r of extraResults) {
            if (r?.items) all = all.concat(r.items);
          }
        }

        if (!current) return;
        setSamplesList(all);
        const demoRoot = all.find(s => s.sample_id === 252 || s.sample_code === 'DEMO-ROOT');
        const fallbackId = demoRoot ? demoRoot.sample_id : all[0]?.sample_id ?? 252;
        setSelectedSampleId(previous => previous ?? initialSampleId ?? fallbackId);
      } catch (err: unknown) {
        console.error('Failed to load samples list', err);
        // Fallback: try default listing if custom params failed
        try {
          const fallbackData = await samplesService.listSamples();
          if (current && fallbackData?.items?.length) {
            setSamplesList(fallbackData.items);
            setSelectedSampleId(previous => previous ?? initialSampleId ?? fallbackData.items[0].sample_id);
            return;
          }
        } catch {}
        setSelectedSampleId(previous => previous ?? initialSampleId ?? 252);
      }
    }
    loadSamples();
    return () => { current = false; };
  }, [initialSampleId]);

  // Fetch DAG Graph Data
  const fetchGraph = useCallback(async () => {
    if (!selectedSampleId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await lineageService.getLineageGraph(selectedSampleId, direction, maxDepth);
      setGraphData(data);
      // Auto-inspect focus node
      const focus = data.nodes.find((n) => n.is_focus);
      if (focus) setInspectedNode(focus);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate lineage graph.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedSampleId, direction, maxDepth]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Compute 2D node card layout positions grouped by generation
  const layout = useMemo(() => {
    if (!graphData) return { nodesPos: new Map<number, { x: number; y: number }>(), bounds: { width: 800, height: 600 } };

    // Group nodes by generation
    const genGroups = new Map<number, LineageNodeItem[]>();
    graphData.nodes.forEach((node) => {
      const gen = node.generation;
      if (!genGroups.has(gen)) genGroups.set(gen, []);
      genGroups.get(gen)!.push(node);
    });

    const sortedGens = Array.from(genGroups.keys()).sort((a, b) => a - b);
    const nodesPos = new Map<number, { x: number; y: number }>();

    const cardWidth = 240;
    const cardHeight = 92;
    const gapX = layoutMode === 'LR' ? 140 : 60;
    const gapY = layoutMode === 'LR' ? 40 : 120;

    let maxW = 800;
    let maxH = 600;

    if (layoutMode === 'LR') {
      sortedGens.forEach((gen, colIndex) => {
        const group = genGroups.get(gen)!;
        const x = 40 + colIndex * (cardWidth + gapX);
        group.forEach((node, rowIndex) => {
          const y = 60 + rowIndex * (cardHeight + gapY);
          nodesPos.set(node.sample_id, { x, y });
          if (x + cardWidth + 100 > maxW) maxW = x + cardWidth + 100;
          if (y + cardHeight + 100 > maxH) maxH = y + cardHeight + 100;
        });
      });
    } else {
      // Top-to-Bottom
      sortedGens.forEach((gen, rowIndex) => {
        const group = genGroups.get(gen)!;
        const y = 60 + rowIndex * (cardHeight + gapY);
        group.forEach((node, colIndex) => {
          const x = 40 + colIndex * (cardWidth + gapX);
          nodesPos.set(node.sample_id, { x, y });
          if (x + cardWidth + 100 > maxW) maxW = x + cardWidth + 100;
          if (y + cardHeight + 100 > maxH) maxH = y + cardHeight + 100;
        });
      });
    }

    return { nodesPos, bounds: { width: maxW, height: maxH } };
  }, [graphData, layoutMode]);

  // Handle Drag / Pan on Canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag when clicking canvas background, not cards
    if ((e.target as HTMLElement).closest('.dag-node-card')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(2.0, Math.max(0.4, prev + delta)));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 40, y: 40 });
  };

  // Submit new relationship link
  const handleAddLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await lineageService.createRelationship(linkForm);
      setSuccessMsg(`Derivation edge '${res.parent_sample_code}' → '${res.child_sample_code}' registered successfully.`);
      setIsAddModalOpen(false);
      if (switchTreeAfterCreate) {
        setSelectedSampleId(linkForm.parent_sample_id);
      }
      await fetchGraph();
      const freshSamples = await samplesService.listSamples({ pageSize: 1000, sortBy: 'sample_id', sortDir: 'asc' });
      setSamplesList(freshSamples.items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register lineage edge.';
      setError(msg);
    }
  };

  // Swap parent and child selections
  const handleSwapParentChild = () => {
    setLinkForm((prev) => ({
      ...prev,
      parent_sample_id: prev.child_sample_id,
      child_sample_id: prev.parent_sample_id,
    }));
  };

  // Delete relationship edge or unlink node
  const handleDeleteEdge = async (relationshipId: number) => {
    if (!window.confirm(`Are you sure you want to remove this node connection (Relationship #${relationshipId})?`)) return;
    try {
      await lineageService.deleteRelationship(relationshipId);
      setSuccessMsg(`Node connection #${relationshipId} removed successfully.`);
      if (inspectedNode) {
        setInspectedNode(null);
      }
      await fetchGraph();
      const freshSamples = await samplesService.listSamples({ pageSize: 1000, sortBy: 'sample_id', sortDir: 'asc' });
      setSamplesList(freshSamples.items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete derivation relationship.';
      setError(msg);
    }
  };

  const handleOpenAddChildForNode = (parentNodeId: number) => {
    const parentSample = samplesList.find(s => s.sample_id === parentNodeId) || graphData?.nodes.find(n => n.sample_id === parentNodeId);
    const unit = parentSample?.quantity_unit || 'mg';
    const childCandidate = samplesList.find(s => s.sample_id !== parentNodeId);
    setSwitchTreeAfterCreate(true);
    setLinkForm({
      parent_sample_id: parentNodeId,
      child_sample_id: childCandidate?.sample_id || 1,
      transformation_type: 'DNA Extraction',
      quantity_transferred: 5,
      quantity_unit: unit,
      notes: '',
    });
    setIsAddModalOpen(true);
  };

  const handleOpenAddModal = () => {
    const parentId = inspectedNode?.sample_id || selectedSampleId || 252;
    handleOpenAddChildForNode(parentId);
  };

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'IN_STORAGE' || s === 'AVAILABLE') return 'badge-success';
    if (s === 'IN_USE' || s === 'PROCESSING') return 'badge-warning';
    if (s === 'DEPLETED' || s === 'DISPOSED') return 'badge-neutral';
    return 'badge-sand';
  };

  const getGenLabel = (gen: number) => {
    if (gen === 0) return 'Focus (Gen 0)';
    if (gen < 0) return `Ancestor (Gen ${gen})`;
    return `Descendant (Gen +${gen})`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top Banner Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitFork size={22} color="var(--color-teal)" />
            Sample Lineage & Directed Acyclic Graph (DAG) Explorer
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
            Recursive multi-generational provenance tracking, aliquot transformation hierarchy, and cycle-free derivation DAG.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setViewMode(viewMode === 'canvas' ? 'table' : 'canvas')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {viewMode === 'canvas' ? <TableIcon size={15} /> : <Layers size={15} />}
            {viewMode === 'canvas' ? 'Tabular View' : 'DAG Canvas'}
          </button>
          <button disabled={!canWrite}
            type="button"
            className="btn btn-primary"
            onClick={handleOpenAddModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            Add Derivation Link
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: '#FDEDEC',
          color: 'var(--color-danger)',
          border: '1px solid rgba(201, 79, 63, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
        }}>
          <AlertCircle size={18} />
          <div style={{ flex: 1 }}>{error}</div>
          <button type="button" onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: '#EBF5F0',
          color: 'var(--color-success)',
          border: '1px solid rgba(46, 125, 90, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
        }}>
          <CheckCircle2 size={18} />
          <div style={{ flex: 1 }}>{successMsg}</div>
          <button type="button" onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Control Bar: Focus Specimen Selector, Direction, Layout */}
      <div className="card" style={{ padding: '14px 20px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)', textTransform: 'uppercase' }}>
              Tree Root / Focus:
            </span>
            <select
              className="input font-mono"
              style={{ width: '260px' }}
              value={selectedSampleId || ''}
              onChange={(e) => setSelectedSampleId(Number(e.target.value))}
              title="Pick ANY specimen to load it as the root of a new independent tree"
            >
              {selectedSampleId && !samplesList.some(s => s.sample_id === selectedSampleId) && <option value={selectedSampleId}>{graphData?.nodes.find(node => node.is_focus)?.sample_code ?? selectedSampleId}</option>}
              {samplesList.map((s) => (
                <option key={s.sample_id} value={s.sample_id}>
                  {s.sample_code} · {s.sample_name.slice(0, 24)}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: 'var(--color-muted)' }} title="Select any specimen above to view its lineage tree — each selection is a standalone tree">
              ← any specimen starts a new tree
            </span>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              backgroundColor: selectedSampleId === 252 ? 'var(--color-pale-teal)' : undefined,
              borderColor: selectedSampleId === 252 ? 'var(--color-teal)' : undefined,
              color: selectedSampleId === 252 ? 'var(--color-teal)' : undefined,
              fontWeight: selectedSampleId === 252 ? 700 : 400,
            }}
            onClick={() => setSelectedSampleId(252)}
            title="Load 4-generation complex demo family tree (#252 DEMO-ROOT)"
          >
            <Sparkles size={13} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
            Demo Tree (#252)
          </button>

          <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--color-border)' }} />

          <DatabaseConcept topic="lineage" />

          {/* Traversal Direction Toggle */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'upstream', 'downstream'] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                className="btn btn-secondary"
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  backgroundColor: direction === dir ? 'var(--color-pale-teal)' : undefined,
                  borderColor: direction === dir ? 'var(--color-teal)' : undefined,
                  color: direction === dir ? 'var(--color-teal)' : undefined,
                  fontWeight: direction === dir ? 700 : 400,
                }}
                onClick={() => setDirection(dir)}
              >
                {dir === 'all' ? 'All DAG Edges' : dir === 'upstream' ? 'Upstream (Ancestors)' : 'Downstream (Descendants)'}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--color-border)' }} />

          {/* Layout Direction (Horizontal / Vertical) */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                backgroundColor: layoutMode === 'LR' ? 'var(--color-pale-teal)' : undefined,
                color: layoutMode === 'LR' ? 'var(--color-teal)' : undefined,
              }}
              onClick={() => setLayoutMode('LR')}
              title="Left-to-Right Pipeline"
            >
              <ArrowRight size={13} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
              Horizontal (L → R)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                backgroundColor: layoutMode === 'TB' ? 'var(--color-pale-teal)' : undefined,
                color: layoutMode === 'TB' ? 'var(--color-teal)' : undefined,
              }}
              onClick={() => setLayoutMode('TB')}
              title="Top-to-Bottom Tree"
            >
              <ArrowDown size={13} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
              Vertical (T ↓ B)
            </button>
          </div>
        </div>

        {/* Zoom & Canvas Tools */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 8px' }}
            onClick={() => handleZoom(0.15)}
            title="Zoom In"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 8px' }}
            onClick={() => handleZoom(-0.15)}
            title="Zoom Out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 8px' }}
            onClick={handleResetView}
            title="Reset Pan / Center"
          >
            <Maximize2 size={15} />
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 8px' }}
            onClick={fetchGraph}
            disabled={loading}
            title="Reload Lineage"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Workspace: Canvas or Table + Right Inspector */}
      <div style={{ display: 'flex', gap: '16px', position: 'relative' }}>
        {viewMode === 'canvas' ? (
          /* ===================================================================== */
          /* Interactive DAG Canvas Area                                           */
          /* ===================================================================== */
          <div
            className="card"
            style={{
              flex: 1,
              height: '620px',
              position: 'relative',
              overflow: 'hidden',
              cursor: isDragging ? 'grabbing' : 'grab',
              backgroundColor: '#FAFCFB',
              backgroundImage: 'radial-gradient(circle, #DCE4E1 1.2px, transparent 1.2px)',
              backgroundSize: '24px 24px',
              userSelect: 'none',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Status watermark / Node count */}
            <div style={{
              position: 'absolute',
              top: '14px',
              left: '16px',
              zIndex: 10,
              display: 'flex',
              gap: '8px',
              pointerEvents: 'none',
            }}>
              <span className="badge badge-sand">
                {graphData?.total_nodes || 0} Nodes
              </span>
              <span className="badge badge-neutral">
                {graphData?.total_edges || 0} Transformation Edges
              </span>
              <span className="badge badge-success">
                DAG Cycle-Free
              </span>
            </div>

            {loading ? (
              <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-muted)',
              }}>
                <RefreshCw size={28} className="animate-spin" style={{ marginBottom: '10px' }} />
                <span>Traversing recursive ancestry and descendant CTEs...</span>
              </div>
            ) : !graphData || graphData.nodes.length === 0 ? (
              <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-muted)',
              }}>
                <Search size={32} style={{ marginBottom: '10px' }} />
                <span>No lineage records found for selected specimen.</span>
              </div>
            ) : (
              <div
                style={{
                  position: 'absolute',
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                  transition: isDragging ? 'none' : 'transform 0.05s ease-out',
                  width: `${layout.bounds.width}px`,
                  height: `${layout.bounds.height}px`,
                }}
              >
                {/* SVG Layer for Directed Cubic Curves & Edge Labels */}
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    overflow: 'visible',
                  }}
                >
                  <defs>
                    <marker
                      id="dag-arrow"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--color-teal)" />
                    </marker>
                  </defs>

                  {graphData.edges.map((edge) => {
                    const srcPos = layout.nodesPos.get(edge.source);
                    const tgtPos = layout.nodesPos.get(edge.target);
                    if (!srcPos || !tgtPos) return null;

                    const cardW = 240;
                    const cardH = 92;

                    let x1: number, y1: number, x2: number, y2: number;
                    let cx1: number, cy1: number, cx2: number, cy2: number;

                    if (layoutMode === 'LR') {
                      x1 = srcPos.x + cardW;
                      y1 = srcPos.y + cardH / 2;
                      x2 = tgtPos.x;
                      y2 = tgtPos.y + cardH / 2;
                      const dx = (x2 - x1) * 0.5;
                      cx1 = x1 + dx;
                      cy1 = y1;
                      cx2 = x2 - dx;
                      cy2 = y2;
                    } else {
                      x1 = srcPos.x + cardW / 2;
                      y1 = srcPos.y + cardH;
                      x2 = tgtPos.x + cardW / 2;
                      y2 = tgtPos.y;
                      const dy = (y2 - y1) * 0.5;
                      cx1 = x1;
                      cy1 = y1 + dy;
                      cx2 = x2;
                      cy2 = y2 - dy;
                    }

                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;

                    return (
                      <g key={edge.relationship_id}>
                        {/* Glow / Outline path for visibility */}
                        <path
                          d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="5"
                        />
                        {/* Main directed cubic Bézier edge */}
                        <path
                          d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                          fill="none"
                          stroke="var(--color-teal)"
                          strokeWidth="2.2"
                          strokeDasharray={edge.transformation_type === 'Aliquot' ? '4 3' : undefined}
                          markerEnd="url(#dag-arrow)"
                        />
                        {/* Transformation badge chip at midpoint with delete action */}
                        <foreignObject
                          x={midX - 70}
                          y={midY - 14}
                          width={140}
                          height={28}
                          style={{ overflow: 'visible' }}
                        >
                          <div style={{
                            backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            fontSize: '10px',
                            fontWeight: 600,
                            color: 'var(--color-ink)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            boxShadow: '0 1px 4px rgba(23, 43, 58, 0.08)',
                            pointerEvents: 'auto',
                          }}>
                            <span>{edge.transformation_type}</span>
                            {canWrite && (
                              <button
                                type="button"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '0 2px',
                                  color: 'var(--color-danger)',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  lineHeight: 1,
                                }}
                                title={`Remove derivation edge #${edge.relationship_id} (${edge.source_code} → ${edge.target_code})`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteEdge(edge.relationship_id);
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}
                </svg>

                {/* HTML Cards Layer */}
                {graphData.nodes.map((node) => {
                  const pos = layout.nodesPos.get(node.sample_id);
                  if (!pos) return null;

                  const isInspected = inspectedNode?.sample_id === node.sample_id;
                  const isFocus = node.is_focus;
                  const incomingParentEdge = graphData.edges.find((e) => e.target === node.sample_id);

                  return (
                    <div
                      key={node.sample_id}
                      className="dag-node-card"
                      onClick={() => setInspectedNode(node)}
                      style={{
                        position: 'absolute',
                        left: `${pos.x}px`,
                        top: `${pos.y}px`,
                        width: '240px',
                        height: '92px',
                        backgroundColor: isFocus ? '#FAFDFD' : 'var(--color-surface)',
                        border: isFocus
                          ? '2px solid var(--color-teal)'
                          : isInspected
                          ? '2px solid var(--color-navy)'
                          : node.is_ancient
                          ? '1.5px solid var(--color-sand)'
                          : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-control)',
                        boxShadow: isFocus
                          ? '0 4px 14px rgba(40, 125, 120, 0.18)'
                          : '0 2px 6px rgba(23, 43, 58, 0.06)',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      {/* Card Header: Specimen ID & Generation badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            className="font-mono"
                            style={{
                              fontWeight: 700,
                              fontSize: '13px',
                              color: isFocus ? 'var(--color-teal)' : 'var(--color-ink)',
                            }}
                          >
                            {node.sample_code}
                          </span>
                          {node.is_root && (
                            <span style={{ fontSize: '9px', padding: '1px 4px', backgroundColor: 'var(--color-pale-teal)', color: 'var(--color-teal)', borderRadius: '3px', fontWeight: 700 }}>
                              ROOT
                            </span>
                          )}
                          {node.is_leaf && (
                            <span style={{ fontSize: '9px', padding: '1px 4px', backgroundColor: '#F0F2F1', color: 'var(--color-muted)', borderRadius: '3px', fontWeight: 600 }}>
                              LEAF
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {incomingParentEdge && canWrite && (
                            <button
                              type="button"
                              style={{
                                background: '#FFF1F0',
                                border: '1px solid rgba(201, 79, 63, 0.4)',
                                borderRadius: '4px',
                                color: 'var(--color-danger)',
                                cursor: 'pointer',
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                lineHeight: 1.2,
                              }}
                              title={`Remove node connection / unlink from ${incomingParentEdge.source_code}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteEdge(incomingParentEdge.relationship_id);
                              }}
                            >
                              ✕ Del
                            </button>
                          )}
                          <span className={`badge ${getStatusBadge(node.sample_status)}`} style={{ fontSize: '10px' }}>
                            {node.sample_status}
                          </span>
                        </div>
                      </div>

                      {/* Card Body: Title */}
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--color-ink)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }} title={node.sample_name}>
                        {node.sample_name}
                      </div>

                      {/* Card Footer: Stock, Type & +Child Action */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                        <span className="font-mono" style={{ color: 'var(--color-muted)' }}>
                          {node.quantity_value.toFixed(1)} {node.quantity_unit}
                        </span>

                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <span className="badge badge-neutral font-mono" style={{ fontSize: '9px' }}>
                            {node.sample_type_code}
                          </span>
                          {canWrite && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '1px 5px', fontSize: '10px', height: '20px', lineHeight: 1 }}
                              title={`Derive and add child node from ${node.sample_code}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAddChildForNode(node.sample_id);
                              }}
                            >
                              + Child
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ===================================================================== */
          /* Accessible Table Fallback View (Nodes & Derivation Edges)             */
          /* ===================================================================== */
          <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Table Mode Tabs */}
            <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--color-border)', backgroundColor: '#FAFAFA' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  backgroundColor: tableTab === 'nodes' ? 'var(--color-pale-teal)' : undefined,
                  borderColor: tableTab === 'nodes' ? 'var(--color-teal)' : undefined,
                  color: tableTab === 'nodes' ? 'var(--color-teal)' : undefined,
                  fontWeight: tableTab === 'nodes' ? 700 : 400,
                }}
                onClick={() => setTableTab('nodes')}
              >
                Specimens in Lineage ({graphData?.nodes.length || 0})
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  backgroundColor: tableTab === 'edges' ? 'var(--color-pale-teal)' : undefined,
                  borderColor: tableTab === 'edges' ? 'var(--color-teal)' : undefined,
                  color: tableTab === 'edges' ? 'var(--color-teal)' : undefined,
                  fontWeight: tableTab === 'edges' ? 700 : 400,
                }}
                onClick={() => setTableTab('edges')}
              >
                Derivation Relationships / Edges ({graphData?.edges.length || 0})
              </button>
            </div>

            {tableTab === 'nodes' ? (
              <CompactTable label="lineage specimens" extra={[4, 5, 6, 7]} showLens={false}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '110px' }}>Generation</th>
                      <th>Specimen ID</th>
                      <th>Specimen Title</th>
                      <th>Type</th>
                      <th>Stock</th>
                      <th>Location</th>
                      <th>Topology</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {graphData?.nodes.map((node) => {
                      const parentEdge = graphData.edges.find((e) => e.target === node.sample_id);
                      return (
                        <tr
                          key={node.sample_id}
                          style={{
                            backgroundColor: node.is_focus ? 'var(--color-pale-teal)' : undefined,
                          }}
                        >
                          <td>
                            <span className="badge badge-sand font-mono" style={{ fontSize: '11px' }}>
                              {node.generation === 0 ? 'Gen 0' : node.generation < 0 ? `Gen ${node.generation}` : `Gen +${node.generation}`}
                            </span>
                          </td>
                          <td>
                            <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                              {node.sample_code}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{node.sample_name}</td>
                          <td>
                            <span className="badge badge-neutral font-mono">{node.sample_type_code}</span>
                          </td>
                          <td className="font-mono">
                            {node.quantity_value.toFixed(1)} {node.quantity_unit}
                          </td>
                          <td>
                            <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-teal)' }}>
                              {node.storage_location_code || 'Unassigned'}
                            </span>
                          </td>
                          <td>
                            {node.is_root && <span className="badge badge-success">Root</span>}
                            {node.is_leaf && <span className="badge badge-neutral" style={{ marginLeft: '4px' }}>Leaf</span>}
                            {node.is_focus && <span className="badge badge-sand" style={{ marginLeft: '4px' }}>Focus</span>}
                          </td>
                          <td>
                            <span className={`badge ${getStatusBadge(node.sample_status)}`}>
                              {node.sample_status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => {
                                setSelectedSampleId(node.sample_id);
                                setViewMode('canvas');
                              }}
                            >
                              Inspect DAG
                            </button>
                            {canWrite && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  color: 'var(--color-teal)',
                                  borderColor: 'rgba(40, 125, 120, 0.3)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  marginLeft: '6px',
                                }}
                                title={`Derive and add a child node from ${node.sample_code}`}
                                onClick={() => handleOpenAddChildForNode(node.sample_id)}
                              >
                                <Plus size={11} />
                                Add Child
                              </button>
                            )}
                            {parentEdge && canWrite && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  color: 'var(--color-danger)',
                                  borderColor: 'rgba(201, 79, 63, 0.3)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  marginLeft: '6px',
                                }}
                                title={`Unlink child ${node.sample_code} from parent ${parentEdge.source_code}`}
                                onClick={() => handleDeleteEdge(parentEdge.relationship_id)}
                              >
                                <Trash2 size={11} />
                                Unlink Parent
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CompactTable>
            ) : (
              <CompactTable label="lineage specimens" extra={[4, 5]} showLens={false}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Edge ID</th>
                      <th>Origin / Parent</th>
                      <th>Derived / Target</th>
                      <th>Transformation Operation</th>
                      <th>Transferred Quantity</th>
                      <th>Recorded At</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!graphData?.edges || graphData.edges.length === 0) ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '24px' }}>
                          No derivation relationships recorded in this lineage branch.
                        </td>
                      </tr>
                    ) : (
                      graphData.edges.map((e) => (
                        <tr key={e.relationship_id}>
                          <td>
                            <span className="badge badge-neutral font-mono">#{e.relationship_id}</span>
                          </td>
                          <td>
                            <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-teal)' }}>
                              {e.source_code}
                            </span>
                          </td>
                          <td>
                            <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                              {e.target_code}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-sand">{e.transformation_type}</span>
                          </td>
                          <td className="font-mono">
                            {e.quantity_transferred != null ? `${e.quantity_transferred} ${e.quantity_unit || ''}` : 'N/A'}
                          </td>
                          <td style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                            {e.transformed_at ? new Date(e.transformed_at).toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {canWrite && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  color: 'var(--color-danger)',
                                  borderColor: 'rgba(201, 79, 63, 0.3)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Remove derivation relationship"
                                onClick={() => handleDeleteEdge(e.relationship_id)}
                              >
                                <Trash2 size={11} />
                                Remove Edge
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CompactTable>
            )}
          </div>
        )}

        {/* ======================================================================= */}
        {/* Right-Hand Node Inspector Drawer (360px)                                */}
        {/* ======================================================================= */}
        {inspectedNode && (
          <div
            className="card"
            style={{
              width: '360px',
              flexShrink: 0,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              backgroundColor: 'var(--color-surface)',
              borderLeft: '3px solid var(--color-teal)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-sand font-mono" style={{ fontSize: '11px', marginBottom: '4px' }}>
                  {getGenLabel(inspectedNode.generation)}
                </span>
                <h3 className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                  {inspectedNode.sample_code}
                </h3>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-muted)', marginTop: '2px' }}>
                  {inspectedNode.sample_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedNode(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Focus & Add Child Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {!inspectedNode.is_focus && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => setSelectedSampleId(inspectedNode.sample_id)}
                >
                  <Sparkles size={15} />
                  Shift DAG Focus to {inspectedNode.sample_code}
                </button>
              )}
              {canWrite && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, color: 'var(--color-teal)', borderColor: 'var(--color-teal)' }}
                  onClick={() => handleOpenAddChildForNode(inspectedNode.sample_id)}
                >
                  <Plus size={15} />
                  Derive & Add Child Node from {inspectedNode.sample_code}
                </button>
              )}
              {(() => {
                const parentEdge = graphData?.edges.find((e) => e.target === inspectedNode.sample_id);
                if (!parentEdge || !canWrite) return null;
                return (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      color: 'var(--color-danger)',
                      borderColor: 'rgba(201, 79, 63, 0.4)',
                      backgroundColor: '#FFF1F0',
                      fontWeight: 600,
                    }}
                    onClick={() => handleDeleteEdge(parentEdge.relationship_id)}
                  >
                    <Trash2 size={14} />
                    Remove Node from Tree (Unlink)
                  </button>
                );
              })()}
            </div>

            {/* Node Properties */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              backgroundColor: 'var(--color-pale-teal)',
              padding: '12px',
              borderRadius: 'var(--radius-control)',
              fontSize: '12px',
            }}>
              <div>
                <div style={{ color: 'var(--color-muted)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>Specimen Type</div>
                <div style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{inspectedNode.sample_type_name}</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-muted)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>Stock Balance</div>
                <div style={{ fontWeight: 700, color: 'var(--color-teal)' }}>{inspectedNode.quantity_value.toFixed(2)} {inspectedNode.quantity_unit}</div>
              </div>
              <div>
                <div style={{ color: 'var(--color-muted)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>Preservation Status</div>
                <span className={`badge ${getStatusBadge(inspectedNode.sample_status)}`} style={{ marginTop: '2px' }}>
                  {inspectedNode.sample_status}
                </span>
              </div>
              <div>
                <div style={{ color: 'var(--color-muted)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>Storage Slot</div>
                <div className="font-mono" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                  {inspectedNode.storage_location_code || 'Unassigned'}
                </div>
              </div>
            </div>

            {/* Direct Edges for Inspected Node */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-ink)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Incident Derivation Edges
              </div>
              {graphData?.edges
                .filter((e) => e.source === inspectedNode.sample_id || e.target === inspectedNode.sample_id)
                .map((e) => {
                  const isOutgoing = e.source === inspectedNode.sample_id;
                  return (
                    <div
                      key={e.relationship_id}
                      style={{
                        padding: '8px 10px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-control)',
                        marginBottom: '6px',
                        fontSize: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: isOutgoing ? 'var(--color-teal)' : 'var(--color-navy)' }}>
                          {isOutgoing ? 'Derives →' : 'Derived From ←'}
                        </span>{' '}
                        <span className="font-mono" style={{ fontWeight: 700 }}>
                          {isOutgoing ? e.target_code : e.source_code}
                        </span>
                        <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                          {e.transformation_type} {e.quantity_transferred && `(${e.quantity_transferred} ${e.quantity_unit})`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={() => setSelectedSampleId(isOutgoing ? e.target : e.source)}
                        >
                          Jump
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{
                              padding: '2px 6px',
                              fontSize: '10px',
                              color: 'var(--color-danger)',
                              borderColor: 'rgba(201, 79, 63, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                            title="Remove this derivation relationship"
                            onClick={() => handleDeleteEdge(e.relationship_id)}
                          >
                            <Trash2 size={10} />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* Modal: Add Lineage Derivation Link                                        */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(23, 43, 58, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }}>
          <div className="card" style={{ maxWidth: '640px', width: '100%', padding: '24px', maxHeight: '92vh', overflowY: 'auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitFork size={20} color="var(--color-teal)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-ink)' }}>
                  Record Derivation Lineage Edge
                </h3>
              </div>
              <button type="button" onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Switch / New Tree section */}
            <div style={{
              padding: '10px 14px', marginBottom: '16px',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-control)',
              backgroundColor: '#F7FFFE', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)', whiteSpace: 'nowrap' }}>
                🌳 Switch / New Tree Root:
              </span>
              <select
                className="input font-mono"
                style={{ flex: 1, minWidth: '180px', fontSize: '12px' }}
                value={selectedSampleId || ''}
                onChange={e => setSelectedSampleId(Number(e.target.value))}
              >
                {samplesList.map(s => (
                  <option key={s.sample_id} value={s.sample_id}>
                    #{s.sample_id} · {s.sample_code} · {s.sample_name.slice(0, 30)}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary"
                style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
                onClick={() => setIsAddModalOpen(false)}>
                View Tree →
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', marginBottom: '16px' }} />

            <form onSubmit={handleAddLinkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Swap */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary"
                  style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px' }}
                  onClick={handleSwapParentChild}>
                  <ArrowLeftRight size={13} />
                  Swap Parent ⇄ Child
                </button>
              </div>

              {/* Parent + Child dropdowns side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">
                    Parent (Origin Specimen) * {samplesList.length > 0 && <span style={{ color: 'var(--color-muted)', fontWeight: 400, fontSize: '11px' }}>({samplesList.length} specimens)</span>}
                  </label>
                  <select
                    className="input font-mono"
                    value={linkForm.parent_sample_id}
                    onChange={e => setLinkForm({ ...linkForm, parent_sample_id: Number(e.target.value) })}
                    style={{ backgroundColor: '#ffffff', color: '#172B3A', opacity: 1, zIndex: 1 }}
                  >
                    {samplesList.length === 0 ? (
                      <option value="">Loading specimens...</option>
                    ) : (
                      samplesList.map(s => (
                        <option key={`parent-${s.sample_id}`} value={s.sample_id} style={{ color: '#172B3A', backgroundColor: '#ffffff' }}>
                          #{s.sample_id} · {s.sample_code} · {s.sample_name ? s.sample_name.slice(0, 24) : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="label">
                    Child / Derived Specimen * {samplesList.length > 0 && <span style={{ color: 'var(--color-muted)', fontWeight: 400, fontSize: '11px' }}>({samplesList.length} specimens)</span>}
                  </label>
                  <select
                    className="input font-mono"
                    value={linkForm.child_sample_id}
                    onChange={e => setLinkForm({ ...linkForm, child_sample_id: Number(e.target.value) })}
                    style={{ backgroundColor: '#ffffff', color: '#172B3A', opacity: 1, zIndex: 1 }}
                  >
                    {samplesList.length === 0 ? (
                      <option value="">Loading specimens...</option>
                    ) : (
                      samplesList.map(s => (
                        <option key={`child-${s.sample_id}`} value={s.sample_id} style={{ color: '#172B3A', backgroundColor: '#ffffff' }}>
                          #{s.sample_id} · {s.sample_code} · {s.sample_name ? s.sample_name.slice(0, 24) : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {linkForm.parent_sample_id === linkForm.child_sample_id && (
                <div style={{ padding: '8px 12px', backgroundColor: '#FDEDEC', color: 'var(--color-danger)', borderRadius: 'var(--radius-control)', fontSize: '12px', fontWeight: 600 }}>
                  ⚠ Parent and child must be different specimens.
                </div>
              )}

              {/* Transformation + Quantity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="label">Transformation Operation *</label>
                  <select
                    className="input"
                    value={linkForm.transformation_type}
                    onChange={e => setLinkForm({ ...linkForm, transformation_type: e.target.value })}
                  >
                    <option value="DNA Extraction">DNA Extraction</option>
                    <option value="Pulverization">Pulverization / Grinding</option>
                    <option value="Aliquot Partition">Aliquot Partition</option>
                    <option value="Homogenization">Homogenization</option>
                    <option value="Enzymatic Digestion">Enzymatic Digestion</option>
                    <option value="RNA Isolation">RNA Isolation</option>
                    <option value="Library Construction">Library Construction</option>
                  </select>
                </div>
                <div>
                  <label className="label">Quantity Transferred</label>
                  <input
                    type="number" step="0.01" min="0" className="input"
                    placeholder="e.g. 10.0"
                    value={linkForm.quantity_transferred || ''}
                    onChange={e => setLinkForm({ ...linkForm, quantity_transferred: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="label">Protocol Notes</label>
                <textarea className="input" rows={2}
                  placeholder="e.g. Extracted using QIAamp DNA Investigator Kit"
                  value={linkForm.notes || ''}
                  onChange={e => setLinkForm({ ...linkForm, notes: e.target.value })}
                />
              </div>

              {/* Switch tree checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={switchTreeAfterCreate}
                  onChange={e => setSwitchTreeAfterCreate(e.target.checked)}
                  style={{ width: '15px', height: '15px', accentColor: 'var(--color-teal)', cursor: 'pointer' }}
                />
                <span>
                  <strong>Switch tree view to parent after creating</strong>
                  <span style={{ color: 'var(--color-muted)', fontSize: '12px', marginLeft: '6px' }}>
                    (loads parent as new tree root — good for starting a fresh tree)
                  </span>
                </span>
              </label>

              {/* Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary"
                  disabled={linkForm.parent_sample_id === linkForm.child_sample_id}>
                  Create Derivation Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
