import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function CarQueue() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [reasons, setReasons] = useState({});

  async function load() { if (currentUser) setRows(await api('/admin/cars/queue').catch(() => [])); }
  useEffect(() => { load(); }, []);

  async function decide(id, decision) {
    setErr('');
    try {
      await api(`/admin/cars/${id}/decide`, { method: 'POST', body: { decision, reason: decision === 'reject' ? reasons[id] : undefined } });
      load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <h1>Car approval queue</h1>
      {err && <div className="alert err">{err}</div>}
      {rows.length === 0 && <div className="card"><p className="muted">Nothing pending review.</p></div>}
      {rows.map((c) => (
        <div className="card" key={c.id}>
          <div className="agent-card-header">
            <div>
              <b>{c.make} {c.model}</b> <span className="muted">{c.year} · {c.category} · {c.transmission} · {c.fuel_type} · {c.seats} seats</span>
              <div className="muted">{c.plate_number}</div>
            </div>
            <span className={`pill ${c.status}`}>{c.status}</span>
          </div>
          {c.pricing_missing && <div className="alert warn car-pricing-warn">Owner has not set a daily rate yet — approval will be blocked.</div>}
          <div className="car-photos">
            {c.photos.map((p) => <img key={p.file_url} src={p.file_url} />)}
          </div>
          <div className="muted car-docs">
            Docs: {c.documents.map((d) => d.doc_type).join(', ') || 'none'}
          </div>
          <div className="car-actions">
            <button className="btn ok sm" onClick={() => decide(c.id, 'approve')}>Approve</button>
            <input className="f car-reject-input" placeholder="Rejection reason (mandatory)"
              value={reasons[c.id] || ''} onChange={(e) => setReasons({ ...reasons, [c.id]: e.target.value })} />
            <button className="btn bad sm" onClick={() => decide(c.id, 'reject')}>Reject</button>
          </div>
        </div>
      ))}
    </>
  );
}
