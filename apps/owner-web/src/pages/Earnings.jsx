import { useEffect, useMemo, useState } from 'react';
import { api, sessionUser } from '../api.js';
import { useData } from '../data.jsx';
import { inr, inrP, pad2, relTime } from '../lib.js';
import { useOverlay } from '../ui.jsx';

/**
 * Earnings: three headline figures, a six-month bar chart, the payout queue
 * and the wallet's transaction ledger, with the Withdraw sheet on the header.
 *
 * The bars start at zero height and grow through the CSS transition rather
 * than rendering at full height immediately -- the numbers themselves are the
 * server's, only their arrival is animated, as in the reference.
 */

const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

/** Eases a number up to its final value once on mount. Presentation only. */
function CountUp({ to, format }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 900);
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{format(v)}</>;
}

export default function Earnings() {
  const { earnings, subs, errors, reload } = useData();
  const open = useOverlay().open;
  const [grew, setGrew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subErr, setSubErr] = useState('');

  const me = sessionUser();
  const wallet = earnings?.wallet;
  const tx = earnings?.transactions || [];
  const payouts = earnings?.payouts || [];

  useEffect(() => {
    const id = requestAnimationFrame(() => setGrew(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const available = Number(wallet?.available_balance_paise) || 0;
  const pending = Number(wallet?.pending_balance_paise) || 0;

  const { thisMonth, lifetime, months } = useMemo(() => {
    const now = new Date();
    const key = monthKey(now);
    let month = 0;
    let life = 0;
    for (const t of tx) {
      const n = Number(t.amount_paise) || 0;
      life += n;
      if (String(t.created_at || '').startsWith(key)) month += n;
    }
    const six = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const k = monthKey(d);
      const sum = tx
        .filter((t) => String(t.created_at || '').startsWith(k))
        .reduce((s, t) => s + (Number(t.amount_paise) || 0), 0);
      six.push({ label: d.toLocaleDateString('en', { month: 'short' }), v: sum });
    }
    return { thisMonth: month, lifetime: life, months: six };
  }, [tx]);

  const peak = Math.max(...months.map((m) => m.v), 1);
  const hasActiveSub = subs.some((s) => s.plan === 'car_owner_monthly' && s.status === 'active');

  async function subscribe() {
    setBusy(true);
    setSubErr('');
    try {
      await api('/subscriptions/owner/monthly', { method: 'POST' });
      await reload();
    } catch (e) {
      setSubErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (errors.earnings) {
    return (
      <div className="wrap">
        <div className="alert err">{errors.earnings}</div>
        <button className="b" onClick={() => reload()}>Retry</button>
      </div>
    );
  }

  return (
    <>
      <div className="hd">
        <div>
          <div className="ey">Wallet</div>
          <h2>Take what you've <em>earned</em></h2>
          <p>Settlements land in the account on file.</p>
        </div>
        <button className="b" onClick={() => open('withdraw')}>
          Withdraw {inr(available / 100)}
        </button>
      </div>

      <div className="sts">
        <div className="c">
          <div className="ey">This month</div>
          <b><CountUp to={thisMonth / 100} format={inr} /></b>
        </div>
        <div className="c">
          <div className="ey">Pending payout</div>
          <b><CountUp to={pending / 100} format={inr} /></b>
        </div>
        <div className="c">
          <div className="ey">Lifetime</div>
          <b><CountUp to={lifetime / 100} format={inr} /></b>
        </div>
      </div>

      <div className="g3">
        <div className="c pn">
          <div className="ph">
            <b>Last six months</b>
            <span className="dl">{inr(lifetime / 100)} total</span>
          </div>
          <div className="ch">
            {months.map((m) => (
              <div key={m.label}>
                <i
                  data-v={inr(m.v / 100)}
                  style={{ height: grew ? `${Math.max(2, (m.v / peak) * 100)}%` : '0%' }}
                />
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="c pn">
          <div className="ph">
            <b>Recent payouts</b>
            <span className="dl">{payouts.length}</span>
          </div>
          {payouts.length === 0 && <p className="mt">No payouts requested yet.</p>}
          {payouts.slice(0, 6).map((p) => (
            <div className="ln" key={p.id}>
              <span>
                <b>{relTime(p.created_at)}</b>
                <small className="mt" style={{ display: 'block' }}>{p.status}</small>
              </span>
              <b>{inrP(p.amount_paise)}</b>
            </div>
          ))}
        </div>
      </div>

      {!hasActiveSub && (
        <div className="c pn" style={{ marginTop: 20 }}>
          <div className="ph"><b>Owner subscription</b></div>
          <p className="mt" style={{ marginBottom: 14 }}>
            The monthly owner plan keeps unlimited listings unlocked.
          </p>
          {subErr && <div className="alert err">{subErr}</div>}
          <button className="b" disabled={busy} onClick={subscribe}>
            {busy ? 'Subscribing…' : 'Subscribe for ₹100/month'}
          </button>
        </div>
      )}

      <div className="c pn" style={{ marginTop: 20 }}>
        <div className="ph">
          <b>Recent activity</b>
          <span className="dl">{tx.length} entries</span>
        </div>
        {tx.length === 0 && <p className="mt">Nothing has moved through the wallet yet.</p>}
        {tx.map((t) => (
          <div className="ln" key={t.id}>
            <span>
              <b>{t.note || t.type}</b>
              <small className="mt" style={{ display: 'block' }}>
                {relTime(t.created_at)} · {t.method || t.status}
                {t.payer_id === me?.id ? ' · outbound' : ''}
              </small>
            </span>
            <b>{inrP(t.amount_paise)}</b>
          </div>
        ))}
      </div>
    </>
  );
}
