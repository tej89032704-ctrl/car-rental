import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Kyc() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    try { setData(await api('/kyc/me')); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (currentUser) load(); }, []);

  async function upload(docType, file) {
    setErr(''); setMsg('');
    try {
      await api('/kyc/documents', { method: 'POST', form: (() => { const fd = new FormData(); fd.append('doc_type', docType); fd.append('file', file); return fd; })() });
      setMsg('Uploaded. Awaiting review.');
      load();
    } catch (e) { setErr(e.message); }
  }

  if (!currentUser) return <div className="alert info">Login first.</div>;
  if (!data) return err ? <div className="alert err">{err}</div> : <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-header">
        <h1>Account verification</h1>
      </div>
      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}
      <div className="card">
        <div className="info-row">
          <span className="info-label">Status</span>
          <span className={`pill ${currentUser.kyc_status}`}>{currentUser.kyc_status}</span>
          <span className="info-label" style={{ marginLeft: 12 }}>Phone</span>
          <span className={`pill ${currentUser.status === 'active' ? 'active' : 'pending_otp'}`}>{currentUser.status}</span>
        </div>
        {data.complete
          ? <div className="alert good">Your verification is complete. Enjoy the platform!</div>
          : <div className="alert info">Upload the documents below. Verification unlocks all account actions.</div>}
        {data.required_docs.map((t) => {
          const doc = data.documents.find((d) => d.doc_type === t);
          return (
            <div key={t} className="kyc-doc-row">
              <span className="kyc-doc-label">{t.replace('_', ' ')}</span>
              <input type="file" onChange={(e) => upload(t, e.target.files[0])} />
              {doc && <span className={`pill ${doc.status}`}>{doc.status}</span>}
            </div>
          );
        })}
      </div>

      <h2>Change account type</h2>
      <RoleChange />
    </>
  );
}

function RoleChange() {
  const [requests, setRequests] = useState([]);
  const [desired, setDesired] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function load() { try { setRequests(await api('/auth/role-change-requests/mine')); } catch { /* noop */ } }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setMsg(''); setErr('');
    try {
      const r = await api('/auth/role-change-request', { method: 'POST', body: { desired_role: desired } });
      setMsg(r.message); load();
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <div className="card">
      <p className="muted">Your role is fixed at signup. Switching (e.g., renter → owner) needs Super Admin approval.</p>
      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}
      {currentUser.role !== 'car_renter' && currentUser.role !== 'car_owner' ? null : (
        <form onSubmit={submit} className="action-bar">
          <select className="f" style={{ maxWidth: 240 }} value={desired} onChange={(e) => setDesired(e.target.value)} required>
            <option value="">Switch to…</option>
            {['car_owner', 'car_renter', 'agent'].filter((r) => r !== currentUser.role).map((r) => <option key={r}>{r}</option>)}
          </select>
          <button className="btn sm">Request change</button>
        </form>
      )}
      {requests.length > 0 && (
        <table className="t" style={{ marginTop: 12 }}>
          <thead><tr><th>Requested</th><th>From → To</th><th>Status</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.current_role} → {r.desired_role}</td>
                <td><span className={`pill ${r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending'}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
