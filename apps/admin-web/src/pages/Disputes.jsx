import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Disputes() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({});

  async function load() { if (currentUser) setRows(await api('/admin/disputes/open').catch(() => [])); }
  useEffect(() => { load(); }, []);

  async function resolve(id) {
    setErr('');
    const f = form[id] || {};
    try {
      await api(`/admin/disputes/${id}/resolve`, {
        method: 'POST',
        body: {
          resolution_note: f.note,
          ...(f.refund ? { refund_amount_paise: Math.round(f.refund * 100) } : {}),
          ...(f.penalty ? { penalty_amount_paise: Math.round(f.penalty * 100) } : {}),
        },
      });
      load();
    } catch (e) { setErr(e.message); }
  }
  const set = (id, k) => (e) => setForm({ ...form, [id]: { ...form[id], [k]: e.target.value } });

  return (
    <>
      <h1>Dispute resolution</h1>
      {err && <div className="alert err">{err}</div>}
      {rows.length === 0 && <div className="card"><p className="muted">No open disputes.</p></div>}
      {rows.map((d) => (
        <div className="card" key={d.id}>
          <b>Booking {d.booking_id.slice(0, 8)}…</b> <span className="pill requested">open</span>
          <p className="dispute-reason">{d.reason}</p>
          <p className="muted">Raised by {d.raised_by?.slice(0, 8)} against {d.against_user_id?.slice(0, 8)}</p>
          <div className="row">
            <div className="form-group"><label className="f">Resolution note *</label><input className="f" value={form[d.id]?.note || ''} onChange={set(d.id, 'note')} /></div>
            <div className="form-group"><label className="f">Refund to raiser (₹)</label><input className="f" type="number" value={form[d.id]?.refund || ''} onChange={set(d.id, 'refund')} /></div>
            <div className="form-group"><label className="f">Penalty on other party (₹)</label><input className="f" type="number" value={form[d.id]?.penalty || ''} onChange={set(d.id, 'penalty')} /></div>
          </div>
          <br />
          <button className="btn sm" onClick={() => resolve(d.id)}>Resolve</button>
        </div>
      ))}
    </>
  );
}
