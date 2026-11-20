import React, { useState } from 'react';
import {
  Activity,
  ChevronRight,
} from 'lucide-react';
import { ActivityFeedItem } from '../types';

interface ActivityTimelineProps {
  activities: ActivityFeedItem[];
  isLoading: boolean;
  onNavigateSection: (section: string) => void;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  activities,
  isLoading,
  onNavigateSection,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [visibleCount, setVisibleCount] = useState(5);

  const getEntityRoute = (entityType: string) => {
    switch (entityType.toLowerCase()) {
      case 'sample':
      case 'samplerelationship':
        return 'samples';
      case 'storagelocation':
      case 'samplestoragehistory':
        return 'storage';
      case 'equipment':
        return 'equipment';
      case 'experiment':
      case 'experimentsample':
        return 'experiments';
      case 'experimentresult':
        return 'results';
      case 'sampletest':
        return 'tests';
      case 'incident':
        return 'incidents';
      case 'aianalysis':
        return 'ai_analysis';
      case 'ancientspecimen':
      case 'archaeologicalsite':
        return 'ancient';
      case 'systemintegrity':
      case 'databaseintegrity':
        return 'reports';
      default:
        return 'overview';
    }
  };

  const getCategoryFromEntityType = (entityType: string): string => {
    const et = entityType.toLowerCase();
    if (et.includes('sample')) return 'SAMPLES';
    if (et.includes('storage') || et.includes('equipment')) return 'STORAGE';
    if (et.includes('experiment') || et.includes('result')) return 'EXPERIMENTS';
    if (et.includes('incident')) return 'INCIDENTS';
    if (et.includes('ai')) return 'AI';
    if (et.includes('integrity') || et.includes('audit')) return 'INTEGRITY';
    return 'OTHER';
  };

  const filteredActivities = activities.filter((act) => {
    if (selectedCategory === 'ALL') return true;
    return getCategoryFromEntityType(act.entity_type) === selectedCategory;
  });

  return (
    <div className="card" style={{ padding: '24px', marginBottom: '24px', backgroundColor: 'var(--color-surface)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge badge-success">Feature Four</span>
            <span className="badge badge-sand">Live Audit Trail</span>
            <span className="badge badge-neutral font-mono">Immutable DBMS Log</span>
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-ink)', margin: 0 }}>
            Laboratory Activity & Operational Timeline
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>
            Chronological audit log streaming genuine database events across sample registrations, derivations, relocations, assays, and integrity scans.
          </p>
        </div>

        {/* Category Filters */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['ALL', 'SAMPLES', 'EXPERIMENTS', 'STORAGE', 'INCIDENTS', 'AI'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`badge ${selectedCategory === cat ? 'badge-teal' : 'badge-neutral'}`}
              style={{ border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: '11px' }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-muted)' }}>
          Streaming immutable audit trail events...
        </div>
      ) : filteredActivities.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
          No recorded events found matching category '{selectedCategory}'.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredActivities.slice(0, visibleCount).map((act) => {
            const route = getEntityRoute(act.entity_type);

            return (
              <div
                key={act.audit_log_id}
                onClick={() => onNavigateSection(route)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-control)',
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-teal)';
                  e.currentTarget.style.backgroundColor = 'var(--color-pale-teal)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.backgroundColor = 'var(--color-background)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-teal)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Activity size={14} />
                  </div>
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-ink)' }}>
                      {act.action}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      <span>Entity: <strong>{act.entity_type}</strong></span>
                      {act.entity_id && (
                        <span className="font-mono" style={{ color: 'var(--color-teal)' }}>
                          #{act.entity_id}
                        </span>
                      )}
                      <span>•</span>
                      <span>Actor: <strong>{act.actor_name}</strong></span>
                      {act.actor_role && (
                        <span className="badge badge-neutral" style={{ fontSize: '9.5px', padding: '1px 4px' }}>
                          {act.actor_role}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                    {new Date(act.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <ChevronRight size={13} color="var(--color-teal)" />
                </div>
              </div>
            );
          })}

          {filteredActivities.length > 5 && (
            <div style={{ textAlign: 'center', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setVisibleCount(visibleCount === 5 ? filteredActivities.length : 5)}
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '16px' }}
              >
                {visibleCount === 5 ? (
                  <>Showing 5 of {filteredActivities.length} events • View All ({filteredActivities.length}) ↓</>
                ) : (
                  <>Showing all {filteredActivities.length} events • Show Recent 5 Only ↑</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
