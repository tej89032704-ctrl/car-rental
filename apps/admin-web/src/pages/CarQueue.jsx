import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';
import { RcVerifyBlock, verificationPillClass } from '../../../../packages/shared/src/RcVerify.jsx';

export default function CarQueue() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [reasons, setReasons] = useState({});
  const [verConfig, setVerConfig] = useState(null);
  const [verifying, setVerifying] = useState(null);
  const [overrideInputs, setOverrideInputs] = useState({});

  async function load() {
    if (!currentUser) return;
    setRows(await api('/admin/cars/queue').catch(() => []));
    setVerConfig(await api('/admin/verification/config').catch(() => null));
  }
  useEffect(() => { load(); }, []);

  async function decide(id, decision) {
    setErr('');
    try {
      await api(`/admin/cars/${id}/decide`, { method: 'POST', body: { decision, reason: decision === 'reject' ? reasons[id] : undefined } });
      load();
    } catch (e) { setErr(e.message); }
  }

  async function verify(id) {
    setErr('');
    setVerifying(id);
    try {
      await api(`/admin/cars/${id}/verify`, { method: 'POST' });
      load();
    } catch (e) { setErr(e.message); } finally { setVerifying(null); }
  }

  async function override(id) {
    setErr('');
    try {
      await api(`/admin/cars/${id}/verification/override`, {
        method: 'POST',
        body: { reason: (overrideInputs[id] || '').trim() || 'Manual verification by super admin' },
      });
      setOverrideInputs((m) => ({ ...m, [id]: '' }));
      load();
    } catch (e) { setErr(e.message); }
  }

  const demo = verConfig && !verConfig.live;

  return (
    <>
      <h1>Car approval queue</h1>
      {demo && (
        <div className="alert warn" style={{ marginBottom: 14 }}>
          <b>RC lookup is running in DEMO mode</b> — no live RTO database is connected yet. When you have a VAHAN vendor
          key, set <code>RC_VERIFY_API_KEY</code> (and <code>RC_VERIFY_API_ENDPOINT</code>) in <code>apps/api/.env</code> and
          the same button below will query the real RTO database.
        </div>
      )}
      {err && <div className="alert err">{err}</div>}
      {rows.length === 0 && <div className="card"><p className="muted">Nothing pending review.</p></div>}
      {rows.map((c) => (
        <div className="card" key={c.id}>
          <div className="agent-card-header">
            <div>
              <b>{c.make} {c.model}</b> <span className="muted">{c.year} · {c.category} · {c.transmission} · {c.fuel_type} · {c.seats} seats</span>
              <div className="muted">{c.plate_number}</div>
            </div>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className={`pill ${verificationPillClass(c.verification_status)}`}>{c.verification_status?.toUpperCase() || 'UNVERIFIED'}</span>
              <span className={`pill ${c.status}`}>{c.status}</span>
            </span>
          </div>
          {c.pricing_missing && <div className="alert warn car-pricing-warn">Owner has not set a daily rate yet — approval will be blocked.</div>}
          <div className="car-photos">
            {c.photos.map((p) => <img key={p.file_url} src={p.file_url} />)}
          </div>
          <div className="muted car-docs">
            Docs: {c.documents.map((d) => d.doc_type).join(', ') || 'none'}
          </div>

          <div className="car-actions">
            <button className="btn sec sm" disabled={verifying === c.id} onClick={() => verify(c.id)}>
              {verifying === c.id ? 'Checking RTO…' : c.verification ? 'Re-verify RC' : 'Verify RC (live)'}
            </button>
            <input className="f car-reject-input" placeholder="Override reason (manual verify)"
              value={overrideInputs[c.id] || ''} onChange={(e) => setOverrideInputs({ ...overrideInputs, [c.id]: e.target.value })} />
            <button className="btn sec sm" onClick={() => override(c.id)}>Mark verified (manual)</button>
          </div>
          <RcVerifyBlock v={c.verification} />

          <div className="car-actions" style={{ marginTop: 10 }}>
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