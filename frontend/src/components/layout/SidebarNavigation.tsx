import React from 'react';
import {
  Dna,
  LayoutDashboard,
  FlaskConical,
  GitFork,
  CheckCircle2,
  TestTubes,
  FileText,
  Warehouse,
  Wrench,
  AlertTriangle,
  Scroll,
  BrainCircuit,
  BarChart3,
  Users,
  Database,
  Layers,
} from 'lucide-react';

interface SidebarProps {
  currentSection: string;
  onSelectSection: (section: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { group: 'WORKSPACE', items: [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={17} /> },
    { id: 'samples', label: 'Samples', icon: <FlaskConical size={17} /> },
    { id: 'lineage', label: 'Sample Lineage', icon: <GitFork size={17} /> },
    { id: 'tests', label: 'Tests', icon: <CheckCircle2 size={17} /> },
    { id: 'experiments', label: 'Experiments', icon: <TestTubes size={17} /> },
    { id: 'results', label: 'Results', icon: <FileText size={17} /> },
  ] },
  { group: 'OPERATIONS', items: [
    { id: 'storage', label: 'Storage Locations', icon: <Warehouse size={17} /> },
    { id: 'equipment', label: 'Equipment', icon: <Wrench size={17} /> },
    { id: 'incidents', label: 'Incidents', icon: <AlertTriangle size={17} /> },
    { id: 'ancient', label: 'Ancient Specimens', icon: <Scroll size={17} /> },
  ] },
  { group: 'INTELLIGENCE', items: [
    { id: 'cohort', label: 'Cohort Review', icon: <Layers size={17} /> },
    { id: 'sql_testing', label: 'SQL Testing', icon: <Database size={17} /> },
    { id: 'reports', label: 'Reports & Analysis', icon: <BarChart3 size={17} /> },
    { id: 'assistant', label: 'AI Chat', icon: <BrainCircuit size={17} /> },
    { id: 'news', label: 'World News', icon: <Scroll size={17} /> },
  ] },
  { group: 'ADMINISTRATION', items: [
    { id: 'dbms', label: 'DBMS', icon: <Database size={17} /> },
    { id: 'researchers', label: 'Settings & Roles', icon: <Users size={17} /> },
  ] },
];

export const sectionLabels: Record<string, string> = {
  ...Object.fromEntries(NAV_GROUPS.flatMap(group => group.items.map(item => [item.id, item.label]))),
  settings: 'Settings & Roles',
};

export const SidebarNavigation: React.FC<SidebarProps> = ({ currentSection, onSelectSection }) => {
  return (
    <aside className="workspace-sidebar" style={{
      width: '214px',
      backgroundColor: 'var(--color-navy)',
      color: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      flexShrink: 0,
    }}>
      {/* Brand Header (Section 4) */}
      <div className="sidebar-brand" style={{
        padding: '20px 20px 18px',
        borderBottom: '1px solid rgba(220, 228, 225, 0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          backgroundColor: 'var(--color-teal)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
        }}>
          <Dna size={20} />
        </div>
        <div className="sidebar-text">
          <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            SampleMind
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: '2px' }}>
            RESEARCH WORKSPACE
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav aria-label="Main navigation" style={{ flex: 1, overflowY: 'auto', padding: '14px 10px' }}>
        {NAV_GROUPS.map((grp) => (
          <div key={grp.group} style={{ marginBottom: '18px' }}>
            <div className="sidebar-group" style={{ padding: '6px 10px', fontSize: '10px', color: '#b5cbc6', letterSpacing: '.08em' }}>{grp.group}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {grp.items.map((item) => {
                const isSelected = currentSection === item.id;
                return (
                  <button
                    key={item.id}
                    aria-label={item.label}
                    aria-current={isSelected ? "page" : undefined}
                    title={item.label}
                    type="button"
                    onClick={() => onSelectSection(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: isSelected ? 'rgba(40, 125, 120, 0.28)' : 'transparent',
                      color: isSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.75)',
                      fontWeight: isSelected ? 600 : 400,
                      fontSize: '13px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      borderLeft: isSelected ? '3px solid var(--color-teal)' : '3px solid transparent',
                    }}
                  >
                    <span style={{ color: isSelected ? 'var(--color-teal)' : 'rgba(255, 255, 255, 0.65)' }}>
                      {item.icon}
                    </span>
                    <span className="sidebar-text">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Info */}
      <footer style={{
        padding: '14px 16px',
        borderTop: '1px solid rgba(220, 228, 225, 0.12)',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}>
        <div style={{ fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }}>RVCE DBMS Lab CD-2</div>
        <div>SQL and document workspace</div>
      </footer>
    </aside>
  );
};
