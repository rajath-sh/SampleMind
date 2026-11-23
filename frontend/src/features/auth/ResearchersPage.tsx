import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { apiRequest } from '../../common/apiClient';
import { ConceptInfo } from '../../components/ConceptInfo';
import { useAuth } from './AuthContext';
import type { User, UserRole } from './types';

const roles: UserRole[] = ['ADMIN', 'RESEARCHER', 'TECHNICIAN', 'REVIEWER', 'VIEWER'];
const emptyForm = { display_name: '', email: '', password: '', role: 'RESEARCHER' as UserRole };

export function ResearchersPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [edits, setEdits] = useState<Record<number, UserRole>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.role === 'ADMIN';
  const canRead = isAdmin || user?.role === 'RESEARCHER';

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setBusy(true);
    apiRequest<{ data: User[] }>('/auth/users', { signal: controller.signal }).then(result => setMembers(result.data))
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [canRead]);

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest<{ data: User }>('/auth/register', { method: 'POST', body: JSON.stringify(form) });
      setMembers(previous => [...previous, result.data]);
      setForm(emptyForm);
      setMessage('Researcher account created.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function change(member: User, patch: { is_active?: boolean; role?: UserRole }) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest<{ data: User }>(`/auth/users/${member.user_id}/status`, {
        method: 'PUT', body: JSON.stringify(patch),
      });
      setMembers(previous => previous.map(account => account.user_id === result.data.user_id ? result.data : account));
      setMessage(`Saved changes for ${result.data.display_name}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lab-stack">
      <header className="lab-hero">
        <div><div className="lab-kicker">WORKSPACE ADMINISTRATION</div><h1>Settings &amp; Roles</h1>
          <p>Review account access, manage user roles, and provision laboratory personnel.</p></div>
        <div className="lab-hero-mark" aria-hidden="true"><Users size={48} /></div>
      </header>
      <section className="card lab-panel">
        <div className="lab-title"><ShieldCheck size={20} /><h2>User Accounts &amp; RBAC Directory</h2>
          <ConceptInfo title="Role-based access control" steps={['Signed bearer token', 'Active SQL user', 'Role requirement', 'Audited mutation']}>
            <p>On each request, the server verifies the token, loads the user’s current role and checks the route’s allowed roles. An account change and its audit row commit together.</p>
          </ConceptInfo>
        </div>
        {error && <p role="alert" className="lab-error">{error}</p>}
        {message && <p role="status" className="lab-muted">{message}</p>}
        {!canRead ? <p className="lab-muted">Only administrators and researchers can read the directory.</p> :
          <div className="lab-table-wrap">
            <table className="lab-table"><thead><tr>
              <th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Account</th>
              {isAdmin && <th scope="col">Actions</th>}
            </tr></thead><tbody>
              {members.map(member => {
                const own = member.user_id === user?.user_id;
                const value = edits[member.user_id] ?? member.role;
                return <tr key={member.user_id}>
                  <td>{member.display_name}{own && ' (you)'}</td><td>{member.email}</td>
                  <td>{isAdmin && !own ? <select className="input-field" aria-label={`Role for ${member.display_name}`}
                    value={value} disabled={busy} onChange={event => setEdits({ ...edits, [member.user_id]: event.target.value as UserRole })}>
                    {roles.map(role => <option key={role}>{role}</option>)}
                  </select> : member.role}</td>
                  <td>{member.is_active ? 'Active' : 'Inactive'}</td>
                  {isAdmin && <td><div className="lab-chips">
                    {!own && <>
                      <button type="button" className="btn-secondary" disabled={busy || value === member.role} onClick={() => change(member, { role: value })}>Save role</button>
                      <button type="button" className="btn-secondary" disabled={busy} onClick={() => change(member, { is_active: !member.is_active })}>
                        {member.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </>}
                  </div></td>}
                </tr>;
              })}
            </tbody></table>
            {members.length === 0 && <p className="lab-muted">{busy ? 'Loading accounts…' : 'No accounts returned.'}</p>}
          </div>}
        {isAdmin && <form className="reading-form" onSubmit={register}>
          <h3>Provision an account</h3>
          <fieldset className="lab-controls" disabled={busy}>
            <label>Display name<input className="input-field" required minLength={2} maxLength={120}
              value={form.display_name} onChange={event => setForm({ ...form, display_name: event.target.value })} /></label>
            <label>Email<input className="input-field" required type="email" maxLength={150}
              value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
            <label>Initial password<input className="input-field" required type="password" autoComplete="new-password" minLength={8} maxLength={72}
              value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
            <label>Role<select className="input-field" value={form.role} onChange={event => setForm({ ...form, role: event.target.value as UserRole })}>
              {roles.map(role => <option key={role}>{role}</option>)}
            </select></label>
            <button className="btn-primary" type="submit">Create account</button>
          </fieldset>
        </form>}
      </section>
    </div>
  );
}

