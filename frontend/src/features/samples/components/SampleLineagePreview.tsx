import React, { useState, useEffect } from 'react';
import {
  GitFork,
  ArrowDown,
  ExternalLink,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { lineageService } from '../../lineage/lineageService';
import { LineageGraphResponse, LineageNodeItem } from '../../lineage/types';

interface SampleLineagePreviewProps {
  sampleId: number;
  sampleCode: string;
  onSelectSample: (sampleId: number) => void;
}

export const SampleLineagePreview: React.FC<SampleLineagePreviewProps> = ({
  sampleId,
  sampleCode,
  onSelectSample,
}) => {
  const [graph, setGraph] = useState<LineageGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<LineageNodeItem | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadLineage() {
      setLoading(true);
      setError(null);
      try {
        const data = await lineageService.getLineageGraph(sampleId, 'all', 6);
        if (isMounted) {
          setGraph(data);
          const focal = data.nodes.find((n) => n.sample_id === sampleId) || data.nodes[0] || null;
          setSelectedNode(focal);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load lineage DAG.';
          setError(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadLineage();
    return () => {
      isMounted = false;
    };
  }, [sampleId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
        <div>Computing multi-generational DAG lineage tree for {sampleCode}...</div>
      </div>
    );
  }

  if (error || !graph) {
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
        <div>{error || 'Unable to load lineage graph.'}</div>
      </div>
    );
  }

  // Partition nodes by relative generation:
  // generation < 0 => Upstream Ancestors
  // generation === 0 => Focal Specimen
  // generation > 0 => Downstream Aliquots / Descendants
  const ancestors = graph.nodes.filter((n) => n.generation < 0).sort((a, b) => a.generation - b.generation);
  const focal = graph.nodes.find((n) => n.sample_id === sampleId) || graph.nodes.find((n) => n.generation === 0);
  const descendants = graph.nodes.filter((n) => n.generation > 0).sort((a, b) => a.generation - b.generation);

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'IN_STORAGE' || s === 'AVAILABLE') return 'badge-success';
    if (s === 'IN_USE' || s === 'PROCESSING') return 'badge-warning';
    if (s === 'DEPLETED' || s === 'DISPOSED') return 'badge-neutral';
    return 'badge-sand';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Banner / Legend */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: 'var(--color-pale-teal)',
        borderRadius: 'var(--radius-control)',
        border: '1px solid rgba(40, 125, 120, 0.2)',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitFork size={18} color="var(--color-teal)" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>
            Directed Lineage DAG Topology
          </span>
          <span className="badge badge-neutral font-mono" style={{ fontSize: '11px' }}>
            {graph.total_nodes} Specimens • {graph.total_edges} Transformations
          </span>
        </div>

        <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--color-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6C7A89' }} />
            Ancestors ({ancestors.length})
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-teal)' }} />
            Current Focal Specimen
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2E7D5B' }} />
            Derived Aliquots ({descendants.length})
          </span>
        </div>
      </div>

      {/* Main Diagram Area */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        padding: '20px 10px',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-control)',
        border: '1px solid var(--color-border)',
        overflowX: 'auto',
      }}>
        {/* SECTION 1: Upstream Ancestors (if any) */}
        {ancestors.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-muted)', letterSpacing: '0.05em' }}>
              Upstream Ancestor Specimen(s)
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {ancestors.map((node) => {
                const isSelected = selectedNode?.sample_id === node.sample_id;
                return (
                  <div
                    key={node.sample_id}
                    onClick={() => setSelectedNode(node)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'var(--color-pale-teal)' : '#FFFFFF',
                      border: isSelected ? '2px solid var(--color-teal)' : '1px solid var(--color-border)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      minWidth: '180px',
                      maxWidth: '220px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="font-mono" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--color-ink)' }}>
                        {node.sample_code}
                      </span>
                      <span className="badge badge-sand" style={{ fontSize: '9px', padding: '1px 5px' }}>
                        Gen {node.generation}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-ink)', fontWeight: 600, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {node.sample_name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '11px' }}>
                      <span className={`badge ${getStatusBadge(node.sample_status)}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                        {node.sample_status}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                        {node.quantity_value.toFixed(1)} {node.quantity_unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Connecting Edge Arrows */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--color-teal)', margin: '4px 0' }}>
              <ArrowDown size={18} />
              {graph.edges.filter((e) => e.target === sampleId).map((e) => (
                <div key={e.relationship_id} style={{
                  fontSize: '11px',
                  backgroundColor: 'var(--color-pale-teal)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  border: '1px solid rgba(40, 125, 120, 0.2)',
                  color: 'var(--color-teal)',
                  fontWeight: 600,
                  marginTop: '2px',
                }}>
                  {e.transformation_type} ({e.quantity_transferred} {e.quantity_unit || ''})
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 2: Focal Current Specimen Node */}
        {focal && (
          <div style={{
            padding: '14px 20px',
            borderRadius: '10px',
            backgroundColor: '#FFFFFF',
            border: '2px solid var(--color-teal)',
            boxShadow: '0 0 0 4px rgba(40, 125, 120, 0.15), 0 3px 8px rgba(0,0,0,0.08)',
            minWidth: '240px',
            maxWidth: '300px',
            textAlign: 'center',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Sparkles size={14} color="var(--color-teal)" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-teal)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Focal Specimen
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-ink)' }}>
              {focal.sample_code}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', marginTop: '2px' }}>
              {focal.sample_name}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
              <span className={`badge ${getStatusBadge(focal.sample_status)}`}>
                {focal.sample_status}
              </span>
              <span className="badge badge-neutral font-mono">
                {focal.quantity_value.toFixed(2)} {focal.quantity_unit}
              </span>
            </div>
            {focal.storage_location_code && (
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '6px' }}>
                Storage: <strong className="font-mono" style={{ color: 'var(--color-teal)' }}>{focal.storage_location_code}</strong>
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: Downstream Derived Aliquots (if any) */}
        {descendants.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%', marginTop: '6px' }}>
            {/* Connecting Edge Arrow */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--color-teal)', margin: '2px 0' }}>
              <ArrowDown size={18} />
              <div style={{
                fontSize: '11px',
                color: 'var(--color-muted)',
                fontStyle: 'italic',
              }}>
                Derived into {descendants.length} child aliquot(s)
              </div>
            </div>

            <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-muted)', letterSpacing: '0.05em' }}>
              Downstream Child Aliquot(s) & Lineage Offshoots
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {descendants.map((node) => {
                const isSelected = selectedNode?.sample_id === node.sample_id;
                // Find edge from focal or parent to this node
                const edge = graph.edges.find((e) => e.target === node.sample_id);

                return (
                  <div
                    key={node.sample_id}
                    onClick={() => setSelectedNode(node)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'var(--color-pale-teal)' : '#FFFFFF',
                      border: isSelected ? '2px solid var(--color-teal)' : '1px solid var(--color-border)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      minWidth: '200px',
                      maxWidth: '240px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="font-mono" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--color-ink)' }}>
                        {node.sample_code}
                      </span>
                      <span className="badge badge-sand" style={{ fontSize: '9px', padding: '1px 5px' }}>
                        Gen +{node.generation}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--color-ink)', fontWeight: 600, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {node.sample_name}
                    </div>

                    {edge && (
                      <div style={{ fontSize: '11px', color: 'var(--color-teal)', fontWeight: 600, marginTop: '4px' }}>
                        {edge.transformation_type} ({edge.quantity_transferred} {edge.quantity_unit || ''})
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '11px' }}>
                      <span className={`badge ${getStatusBadge(node.sample_status)}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                        {node.sample_status}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--color-teal)' }}>
                        {node.quantity_value.toFixed(1)} {node.quantity_unit}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{
                        width: '100%',
                        padding: '3px 0',
                        fontSize: '11px',
                        marginTop: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSample(node.sample_id);
                      }}
                    >
                      Inspect Aliquot Dossier <ExternalLink size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: '12px',
            color: 'var(--color-muted)',
            padding: '10px 16px',
            backgroundColor: 'var(--color-background)',
            borderRadius: '6px',
            marginTop: '8px',
          }}>
            Terminal Node: No downstream aliquots or extracts have been derived from this specimen yet.
          </div>
        )}
      </div>

      {/* Selected Node Quick Dossier Card */}
      {selectedNode && selectedNode.sample_id !== sampleId && (
        <div style={{
          padding: '14px 18px',
          borderRadius: 'var(--radius-control)',
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Selected Lineage Partner Specimen
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span className="font-mono" style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-ink)' }}>
                {selectedNode.sample_code}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--color-ink)' }}>
                {selectedNode.sample_name}
              </span>
              <span className={`badge ${getStatusBadge(selectedNode.sample_status)}`}>
                {selectedNode.sample_status}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '4px' }}>
              Stock: <strong>{selectedNode.quantity_value.toFixed(2)} {selectedNode.quantity_unit}</strong> • Storage: <strong className="font-mono">{selectedNode.storage_location_code || 'Unassigned'}</strong>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 14px' }}
            onClick={() => onSelectSample(selectedNode.sample_id)}
          >
            Switch Focal View to {selectedNode.sample_code}
            <ExternalLink size={13} />
          </button>
        </div>
      )}
    </div>
  );
};
