import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { ShieldCheck, AlertCircle, Loader2, Dna } from 'lucide-react';

interface DemoAccount {
  name: string;
  email: string;
  role: string;
  description: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    name: 'Dr. Rajath V Shanbhogue',
    email: 'rajath.vs@rvce.edu.in',
    role: 'ADMIN',
    description: 'System Admin: Full custody, user management & incident escalation',
  },
  {
    name: 'Siddhanth K Jain',
    email: 'siddhanth.kj@rvce.edu.in',
    role: 'RESEARCHER',
    description: 'Lead Researcher: Sample registration, experiments & assays',
  },
  {
    name: 'Vishwas Y K',
    email: 'vishwas.yk@rvce.edu.in',
    role: 'TECHNICIAN',
    description: 'Lab Technician: Incident reporting, temperature readings and handling assessments',
  },
  {
    name: 'Dr. Senior Reviewer',
    email: 'reviewer@rvce.edu.in',
    role: 'REVIEWER',
    description: 'Quality Reviewer: Handling assessments and result verification',
  },
];

export const LoginPage: React.FC = () => {
  const { login, isLoading, error: authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!username.trim() || !password.trim()) {
      setLocalError('Please enter both email/username and password.');
      return;
    }
    try {
      await login({ username, password });
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleSelectDemo = (account: DemoAccount) => {
    setUsername(account.email);
    setPassword('password123');
    setLocalError(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--color-background)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: '36px 32px',
        boxShadow: 'var(--shadow-elevated)',
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-pale-teal)',
            color: 'var(--color-teal)',
            marginBottom: '16px',
          }}>
            <Dna size={28} />
          </div>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--color-teal)',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}>
            RESEARCH WORKSPACE
          </div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--color-ink)',
            marginBottom: '6px',
            letterSpacing: '-0.02em',
          }}>
            BioTrace Lab
          </h1>
          <p style={{
            fontSize: '13px',
            color: 'var(--color-muted)',
            lineHeight: 1.4,
          }}>
            Biological Sample Intelligence & Lineage Management
          </p>
        </div>

        {/* Error Feedback */}
        {(localError || authError) && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            backgroundColor: 'var(--color-danger-bg)',
            border: '1px solid #F5C6CB',
            borderRadius: 'var(--radius-control)',
            padding: '12px',
            marginBottom: '20px',
            fontSize: '13px',
            color: 'var(--color-danger)',
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{localError || authError}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--color-ink)',
              marginBottom: '6px',
            }}>
              Institutional Email / Username
            </label>
            <input
              type="text"
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. rajath.vs@rvce.edu.in"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-ink)',
              }}>
                Password
              </label>
              <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                Demo: <span className="font-mono">password123</span>
              </span>
            </div>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '11px',
              fontSize: '14px',
              marginTop: '4px',
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                <span>Sign in to Research Workspace</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Accounts Quick-Select for Project Evaluation */}
        <div style={{ marginTop: '28px', borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Evaluation Demo Accounts
            </span>
            <span className="badge badge-sand" style={{ fontSize: '11px' }}>
              DBMS Lab CD-2
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => handleSelectDemo(acc)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  backgroundColor: username === acc.email ? 'var(--color-pale-teal)' : '#F9FBFA',
                  border: `1px solid ${username === acc.email ? 'var(--color-teal)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-control)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>
                    {acc.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                    {acc.email}
                  </div>
                </div>
                <span className={`badge ${
                  acc.role === 'ADMIN' ? 'badge-danger' :
                  acc.role === 'RESEARCHER' ? 'badge-success' : 'badge-neutral'
                }`}>
                  {acc.role}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer Academic Notice */}
        <div style={{
          textAlign: 'center',
          marginTop: '20px',
          fontSize: '11px',
          color: 'var(--color-muted)',
        }}>
          RV College of Engineering® · CSE (Data Science)
        </div>
      </div>
    </div>
  );
};
