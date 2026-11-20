import { Notifications } from './Notifications';
import React, { useState } from 'react';
import { useAuth } from '../../features/auth/AuthContext';
import { LogOut, Shield, ChevronDown, Check } from 'lucide-react';

interface TopBarProps {
  currentSection?: string;
  search: React.ReactNode;
  onOpenIncidents: () => void;
}

const ROLES = [
  { role: 'ADMIN', name: 'Dr. Rajath V Shanbhogue', email: 'rajath.vs@rvce.edu.in' },
  { role: 'RESEARCHER', name: 'Siddhanth K Jain', email: 'siddhanth.kj@rvce.edu.in' },
  { role: 'TECHNICIAN', name: 'Vishwas Y K', email: 'vishwas.yk@rvce.edu.in' },
  { role: 'REVIEWER', name: 'Dr. Senior Reviewer', email: 'reviewer@rvce.edu.in' },
  { role: 'VIEWER', name: 'Auditor Inspector', email: 'auditor@rvce.edu.in' },
];

export const TopBar: React.FC<TopBarProps> = ({ currentSection = 'Overview', search, onOpenIncidents }) => {
  const { user, logout, switchDemoRole } = useAuth();
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [roleError, setRoleError] = useState('');

  return (
    <header className="workspace-topbar" style={{
      height: '64px',
      backgroundColor: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      {/* Left: Section Breadcrumb */}
      <div className="topbar-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', color: 'var(--color-muted)' }}>BioTrace Lab</span>
        <span style={{ color: 'var(--color-border)' }}>/</span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>{currentSection}</span>
      </div>

      <div className="topbar-search">{search}</div>

      {/* Right: DBMS Context Indicator, Demo Role Switcher & User Account */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Notifications onOpenIncidents={onOpenIncidents} />
        {/* DBMS Context Indicator (Section A2) */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            aria-expanded={showRoleMenu}
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              backgroundColor: 'var(--color-pale-teal)',
              border: '1px solid rgba(40, 125, 120, 0.25)',
              borderRadius: 'var(--radius-control)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--color-teal)',
            }}
          >
            <Shield size={13} />
            <span>Role: <strong>{user?.role || 'Guest'}</strong></span>
            <ChevronDown size={13} />
          </button>

          {showRoleMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '6px',
              width: '260px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-elevated)',
              padding: '6px',
              zIndex: 50,
            }}>
              <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                Evaluation Role Switcher
              </div>
              {roleError && <p className="lab-error" role="alert">{roleError}</p>}
              {ROLES.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  onClick={async () => {
                    setRoleError('');
                    try { await switchDemoRole(r.email); setShowRoleMenu(false); }
                    catch (error) { setRoleError((error as Error).message); }
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: user?.email === r.email ? 'var(--color-pale-teal)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-ink)' }}>{r.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{r.role}</div>
                  </div>
                  {user?.email === r.email && <Check size={14} style={{ color: 'var(--color-teal)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Profile Badge */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-navy)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 600,
            }}>
              {user?.display_name ? user.display_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="topbar-meta" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                {user?.display_name || 'User'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                {user?.email || ''}
              </span>
            </div>
            <ChevronDown size={14} style={{ color: 'var(--color-muted)' }} />
          </button>

          {showUserMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '6px',
              width: '180px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-elevated)',
              padding: '6px',
              zIndex: 50,
            }}>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setShowUserMenu(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-danger)',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
