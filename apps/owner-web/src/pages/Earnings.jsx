import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Earnings() {
  const [data, setData] = useState(null);
  const [subs, setSubs] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [amount, setAmount] = useState('');

  async function load() {
    try {
      setData(await api('/payments/earnings'));
      setSubs(await api('/subscriptions/mine'));
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (currentUser) load(); }, []);

  async function act(fn) {
    setErr(''); setMsg('');
    try { const r = await fn(); setMsg(r.message || 'Done'); load(); } catch (e) { setErr(e.message); }
  }

  if (!currentUser) return <div className="alert info">Login first.</div>;
  if (!data) return err ? <div className="alert err">{err}</div> : <p className="muted">Loading…</p>;

  const hasActiveSub = subs.some((s) => s.plan === 'car_owner_monthly' && s.status === 'active');

  return (
    <div className="wrap">
      <div className="page-header">
        <h1>Earnings</h1>
      </div>
      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">₹{(data.wallet.available_balance_paise / 100).toFixed(2)}</div>
          <div className="stat-label">Available (can withdraw)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₹{(data.wallet.pending_balance_paise / 100).toFixed(2)}</div>
          <div className="stat-label">Pending settlement</div>
        </div>
      </div>

      <h2>Subscription</h2>
      <div className="card">
        {hasActiveSub
          ? <>
            <span className="pill active">active</span>
            <p className="muted mt-8">
              Valid until {new Date(subs.filter((s) => s.plan === 'car_owner_monthly')[0]?.period_end).toLocaleDateString()}
            </p>
          </>
          : <p className="muted">No active subscription.</p>}
        <button className="btn" onClick={() => act(() => api('/subscriptions/owner/monthly', { method: 'POST' }))}>
          {hasActiveSub ? 'Renew (₹100/month)' : 'Subscribe ₹100/month'}
        </button>
      </div>

      <h2>Withdraw</h2>
      <div className="card">
        <div className="form-group">
          <input className="f max-w-200" type="number" placeholder="Amount in ₹" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="btn sm" onClick={() => act(() => api('/payouts/request', { method: 'POST', body: { amount_paise: Math.round(+amount * 100) } }))}>Request payout</button>
        <p className="muted mt-8">Super Admin approves payouts before money moves.</p>
        {data.payouts.length > 0 && (
          <div className="table-wrap mt-12">
            <table className="t"><thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
              {data.payouts.map((p) => (
                <tr key={p.id}><td>{new Date(p.created_at).toLocaleDateString()}</td><td>₹{(p.amount_paise / 100).toFixed(2)}</td><td><span className={`pill ${p.status}`}>{p.status}</span></td></tr>
              ))}
            </tbody></table>
          </div>
        )}
      </div>

      <h2>Transactions</h2>
      <div className="card">
        {data.transactions.length === 0 && <p className="muted">Nothing yet.</p>}
        {data.transactions.length > 0 && (
          <div className="table-wrap">
            <table className="t"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                  <td>{t.type.replace(/_/g, ' ')}</td>
                  <td>{t.payee_id === currentUser.id ? '+' : '−'} ₹{(t.amount_paise / 100).toFixed(2)}</td>
                  <td><span className={`pill ${t.status}`}>{t.status}</span></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
      </div>
    </div>
  );
}
