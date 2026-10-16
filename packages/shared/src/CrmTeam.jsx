import { useEffect, useState } from 'react';
import { api, sessionUser } from './api.js';
import '../styles/crm.css';
const empty = { name: '', email: '', phone: '', password: '', role: 'manager' };
export default function CrmTeam() {
  const admin = sessionUser()?.role === 'super_admin';
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() { setRows(await api('/crm/staff')); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  async function act(fn) {
    setBusy(true); setError(''); setMessage('');
    try { const r = await fn(); setMessage(r.message); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="crm crm-staff"><header className="crm-hero"><div><span className="crm-eyebrow">PEOPLE / OPERATIONS</span><h1>{admin ? 'Build your operations team.' : 'Your field team.'}</h1><p>{admin ? 'Provision staff and give every agent a clear manager. No financial privileges are granted to managers.' : 'Only agents assigned to you appear here. Contact the super admin to change membership.'}</p></div></header>
    {error && <div className="alert err" role="alert">{error}</div>}{message && <div className="alert good" role="status">{message}</div>}
    {admin && <form className="card" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await api('/crm/staff', { method: 'POST', body: form }); setForm(empty); return r; }); }}><h2>Create staff account</h2><div className="crm-fields"><label>Role<select className="f" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="manager">Manager</option><option value="agent">Agent</option></select></label><label>Full name<input className="f" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Email<input className="f" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Phone<input className="f" type="tel" required pattern="\+?[0-9]{10,14}" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label>Initial password (12–72 characters)<input className="f" type="password" required minLength={12} maxLength={72} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label></div><p className="muted">Share credentials privately. Managers sign in through their separate portal.</p><button className="btn" disabled={busy}>Create account</button></form>}
    <div className="table-wrap"><table className="t"><thead><tr><th>Staff member</th><th>Role</th><th>Status</th><th>Manager / team</th></tr></thead><tbody>{rows.map((u) => <tr key={u.id}><td><b>{u.name}</b><div className="muted">{u.email}</div></td><td>{u.role}</td><td>{u.status}</td><td>{u.role === 'agent' ? admin ? <select aria-label={`Manager for ${u.name}`} className="f" disabled={busy} value={u.manager_user_id || ''} onChange={(e) => act(() => api(`/crm/team/${u.id}`, { method: 'PUT', body: { manager_user_id: e.target.value || null } }))}><option value="">Unassigned</option>{rows.filter((m) => m.role === 'manager' && m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select> : 'Your team' : `${rows.filter((a) => a.manager_user_id === u.id).length} agents`}</td></tr>)}</tbody></table>{!rows.length && <p className="card muted">No staff assigned yet.</p>}</div>
  </div>;
}
