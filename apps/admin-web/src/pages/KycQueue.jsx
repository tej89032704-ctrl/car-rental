import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function KycQueue() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  async function load() { try { setRows(await api('/kyc/queue')); } catch (e) { setErr(e.message); } }
  useEffect(() => { load(); }, []);

  async function review(id, decision) {
    setErr('');
    try {
      await api(`/kyc/review/${id}`, { method: 'POST', body: { decision } });
      load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <h1>KYC review queue</h1>
      {err && <div className="alert err">{err}</div>}
      {rows.length === 0 && <div className="card"><p className="muted">No documents awaiting review.</p></div>}
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>User</th><th>Role</th><th>Doc</th><th>Status</th><th>First pass</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{d.name}<div className="muted">{d.phone}</div></td>
                <td>{d.user_role}</td>
                <td>{d.doc_type.replace('_', ' ')}</td>
                <td><span className={`pill ${d.status}`}>{d.status.replace('_', ' ')}</span></td>
                <td className="muted">{d.first_passed_by ? 'done' : '—'}</td>
                <td className="action-cell">
                  <a className="btn sec sm" href={d.file_url} target="_blank" rel="noreferrer">View</a>
                  <button className="btn ok sm" onClick={() => review(d.id, 'approve')}>Approve</button>
                  <button className="btn bad sm" onClick={() => review(d.id, 'reject')}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
