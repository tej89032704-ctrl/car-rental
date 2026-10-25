import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

// Renters are free on CAR-ENT, so the retired renter fee has no control here.
const HIDDEN = new Set(['renter_lifetime_fee_paise']);

const LABELS = {
  owner_subscription_monthly_paise: 'Owner subscription (₹/month)',
  partial_payment_percent: 'Partial payment at booking (% of total)',
  deposit_refund_hours: 'Deposit refund window (hours after trip)',
};

export default function Settings() {
  const [rows, setRows] = useState([]);
  const [vals, setVals] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (currentUser) api('/admin/settings').then((r) => { setRows(r); setVals(Object.fromEntries(r.map((x) => [x.key, x.value_int]))); }).catch((e) => setErr(e.message));
  }, []);

  async function save(key) {
    setErr(''); setMsg('');
    try {
      const r = await api('/admin/settings', { method: 'POST', body: { key, value_int: +vals[key] } });
      setMsg(r.message); refreshList();
    } catch (e) { setErr(e.message); }
  }
  async function refreshList() { setRows(await api('/admin/settings')); }

  return (
    <>
      <h1>Rates & settings</h1>
      <div className="alert info">This is the only place these numbers can change. Every change is written to an immutable audit log.</div>
      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}
      {rows.filter((s) => !HIDDEN.has(s.key)).map((s) => (
        <div className="card" key={s.key}>
          <label className="f">{LABELS[s.key] || s.key}</label>
          <p className="muted">{s.description} · last updated by {s.updated_by}</p>
          <div className="settings-row">
            <input className="f" type="number" value={vals[s.key] ?? ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
            <button className="btn sm" onClick={() => save(s.key)}>Save</button>
          </div>
        </div>
      ))}
    </>
  );
}
