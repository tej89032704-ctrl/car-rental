import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';
import KycVerify from '../../../../packages/shared/src/KycVerify.jsx';

export default function Kyc() {
  if (!currentUser) return <div className="alert info">Login first.</div>;
  return (
    <>
      <KycVerify variant="renter" />
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
