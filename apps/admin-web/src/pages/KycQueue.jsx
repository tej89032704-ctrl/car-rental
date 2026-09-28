import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { TYPE_LABEL, VerifyPill } from '../../../../packages/shared/src/KycStatus.jsx';

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
          <thead>
            <tr><th>User</th><th>Role</th><th>Document</th><th>Checks</th><th>Status</th><th>First pass</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const pack = d.verified_payload ? JSON.parse(d.verified_payload) : null;
              return (
                <tr key={d.id}>
                  <td>{d.name}<div className="muted">{d.phone}</div></td>
                  <td>{d.user_role}</td>
                  <td>
                    <b>{TYPE_LABEL[d.doc_type] || d.doc_type.replace('_', ' ')}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {d.doc_number || '—'}{d.doc_expiry ? ` · valid to ${d.doc_expiry}` : ''}
                    </div>
                    {d.file_url
                      ? <a className="btn sec sm" style={{ marginTop: 6 }} href={d.file_url} target="_blank" rel="noreferrer">View file</a>
                      : <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>verified data only — no file</div>}
                  </td>
                  <td>
                    <VerifyPill status={d.verify_status} detail={d.verify_detail} />
                    {d.verify_detail && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{d.verify_detail}</div>
                    )}
                    {pack && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {pack.name || '—'}{pack.dob || pack.year ? ` · born ${pack.dob || pack.year}` : ''}
                      </div>
                    )}
                  </td>
                  <td><span className={`pill ${d.status}`}>{d.status.replace('_', ' ')}</span></td>
                  <td className="muted">{d.first_passed_by ? 'done' : '—'}</td>
                  <td className="action-cell">
                    <button className="btn ok sm" onClick={() => review(d.id, 'approve')}>Approve</button>
                    <button className="btn bad sm" onClick={() => review(d.id, 'reject')}>Reject</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
