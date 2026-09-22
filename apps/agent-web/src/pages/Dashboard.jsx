import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Dashboard() {
  const [dash, setDash] = useState(null);
  const [leads, setLeads] = useState([]);
  const [queue, setQueue] = useState([]);
  const [form, setForm] = useState({ lead_name: '', lead_phone: '', lead_email: '', lead_type: 'owner_onboarding' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    if (!currentUser) return;
    try {
      setDash(await api('/agent/dashboard'));
      setLeads(await api('/agent/leads'));
      setQueue(await api('/kyc/queue'));
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function act(fn) {
    setErr(''); setMsg('');
    try { const r = await fn(); setMsg(typeof r === 'string' ? r : r.message || 'Done'); load(); } catch (e) { setErr(e.message); }
  }

  async function createLead(e) {
    e.preventDefault();
    await act(async () => {
      const r = await api('/agent/leads', { method: 'POST', body: form });
      return r.dev_otp ? `${r.message} (Dev OTP for the lead: ${r.dev_otp})` : r.message;
    });
    setForm({ lead_name: '', lead_phone: '', lead_email: '', lead_type: 'owner_onboarding' });
  }

  if (!currentUser) return <div className="alert info">Sign in at /agent/login.</div>;

  return (
    <>
      <div className="page-header">
        <h1>Agent dashboard</h1>
      </div>
      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{leads.length}</div>
          <div className="stat-label">Total leads</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{leads.filter((l) => l.account_status === 'active').length}</div>
          <div className="stat-label">Activated</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{dash?.assignments_open?.length ?? 0}</div>
          <div className="stat-label">Open assignments</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₹{(((dash?.employment?.monthly_salary_paise) || 0) / 100).toFixed(0)}</div>
          <div className="stat-label">Monthly salary</div>
        </div>
      </div>

      <div className="section-header">
        <h2>Create a lead (field onboarding)</h2>
      </div>
      <div className="booking-card">
        <p className="muted">Creates a pending account. The person must verify their phone via OTP to become real.</p>
        <form onSubmit={createLead}>
          <div className="row">
            <div className="form-group">
              <label className="f">Lead type</label>
              <select className="f" value={form.lead_type} onChange={(e) => setForm({ ...form, lead_type: e.target.value })}>
                <option value="owner_onboarding">Car owner</option>
                <option value="renter_onboarding">Renter</option>
              </select>
            </div>
            <div className="form-group">
              <label className="f">Name</label>
              <input className="f" value={form.lead_name} onChange={(e) => setForm({ ...form, lead_name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="f">Phone (+91...)</label>
              <input className="f" value={form.lead_phone} onChange={(e) => setForm({ ...form, lead_phone: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="f">Email</label>
              <input className="f" type="email" value={form.lead_email} onChange={(e) => setForm({ ...form, lead_email: e.target.value })} required />
            </div>
          </div>
          <br />
          <button className="btn">Create lead</button>
        </form>
      </div>

      <div className="section-header">
        <h2>My leads</h2>
      </div>
      {leads.length === 0 ? (
        <div className="empty-state">
          <p>No leads yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Account</th><th>KYC</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{l.lead_name}<div className="muted">{l.lead_phone}</div></td>
                  <td>{l.lead_type.replace('_onboarding', '')}</td>
                  <td><span className={`pill ${l.status === 'converted' ? 'completed' : l.status === 'dropped' ? 'cancelled' : 'pending'}`}>{l.status}</span></td>
                  <td>{l.account_status}</td>
                  <td><span className={`pill ${l.account_kyc_status}`}>{l.account_kyc_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-header">
        <h2>KYC first-pass queue (my assigned leads)</h2>
      </div>
      {queue.length === 0 ? (
        <div className="empty-state">
          <p>Nothing assigned to you right now.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>User</th><th>Role</th><th>Doc</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {queue.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}<div className="muted">{d.phone}</div></td>
                  <td>{d.user_role}</td>
                  <td>{d.doc_type.replace('_', ' ')}</td>
                  <td><span className="pill pending">{d.status.replace('_', ' ')}</span></td>
                  <td className="kyc-actions">
                    <a className="btn sec sm" href={d.file_url} target="_blank" rel="noreferrer">View</a>
                    <button className="btn ok sm" onClick={() => act(() => api(`/kyc/review/${d.id}`, { method: 'POST', body: { decision: 'first_pass' } }))}>
                      First-pass OK
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
