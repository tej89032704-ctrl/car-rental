import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Payouts() {
  const [status, setStatus] = useState('requested');
  const [rows, setRows] = useState([]);
  const [reasons, setReasons] = useState({});
  const [err, setErr] = useState('');

  async function load() { if (currentUser) setRows(await api(`/admin/payouts${status ? `?status=${status}` : ''}`).catch(() => [])); }
  useEffect(() => { load(); }, [status]);

  async function act(id, action, reason) {
    setErr('');
    try {
      await api(`/admin/payouts/${id}/${action}`, { method: 'POST', body: reason ? { reason } : undefined });
      load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <h1>Payout approvals</h1>
      {err && <div className="alert err">{err}</div>}
      <div className="tabs">
        {['requested', 'approved', 'paid', 'rejected', ''].map((s) => (
          <button key={s || 'all'} className={`tab ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{s || 'All'}</button>
        ))}
      </div>
      {rows.length === 0 && <div className="card"><p className="muted">No payouts in this view.</p></div>}
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>User</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.user_name}<div className="muted">{p.user_email}</div></td>
                <td><b>₹{(p.amount_paise / 100).toFixed(2)}</b></td>
                <td><span className={`pill ${p.status}`}>{p.status}</span>{p.rejection_reason && <div className="muted">{p.rejection_reason}</div>}</td>
                <td className="action-cell-wrap">
                  {p.status === 'requested' && <>
                    <button className="btn ok sm" onClick={() => act(p.id, 'approve')}>Approve</button>
                    <input className="f payout-reason-input" placeholder="Reason" value={reasons[p.id] || ''} onChange={(e) => setReasons({ ...reasons, [p.id]: e.target.value })} />
                    <button className="btn bad sm" onClick={() => act(p.id, 'reject', reasons[p.id])}>Reject</button>
                  </>}
                  {p.status === 'approved' && <button className="btn sm" onClick={() => act(p.id, 'paid')}>Mark paid</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
