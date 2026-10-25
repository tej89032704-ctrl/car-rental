import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import { inrP } from '../lib.js';
import { useToast } from '../ui.jsx';

/**
 * Membership and the purchases that pay for it.
 *
 * Owners are the paying side of CAR-ENT: one plan, ₹100 a month, billed up
 * front. Renters pay nothing, so nothing here is shown to them. The cover
 * dates come from the subscription row; the ledger below is the list of
 * monthly payments, which is what an owner actually asks for when they want
 * to check what they have been charged.
 */

const day = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Whole days left in the current period, floored at zero. */
const daysLeft = (iso) => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400000) : 0;
};

export default function Membership() {
  const { purchases, errors, reload } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [grew, setGrew] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setGrew(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const plan = purchases?.plan;
  const sub = purchases?.subscription;
  const active = !!purchases?.active;
  const price = plan?.amount_paise ?? 10000;
  const rows = purchases?.purchases || [];
  const left = daysLeft(sub?.period_end);

  async function pay() {
    const verb = active ? 'Extend' : 'Start';
    if (!window.confirm(`${verb} your owner membership for ${inrP(price)}? This adds ${plan?.period_days || 30} days.`)) return;
    setBusy(true);
    setErr('');
    try {
      await api('/subscriptions/owner/monthly', { method: 'POST' });
      await reload();
      toast(active ? 'Membership extended' : 'Membership active');
    } catch (e) {
      setErr(e.message || 'Could not take the payment');
    } finally {
      setBusy(false);
    }
  }

  if (errors.purchases) {
    return (
      <div className="wrap">
        <div className="alert err">{errors.purchases}</div>
        <button className="b" onClick={() => reload()}>Retry</button>
      </div>
    );
  }

  return (
    <>
      <div className="hd">
        <div>
          <div className="ey">Billing</div>
          <h2>Membership &amp; <em>purchases</em></h2>
          <p>{inrP(price)} a month for owners — renters use CAR-ENT free.</p>
        </div>
        <button className="b" disabled={busy} onClick={pay}>
          {busy ? 'Processing…' : active ? `Extend — ${inrP(price)}` : `Pay ${inrP(price)}`}
        </button>
      </div>

      <div className="sts">
        <div className="c">
          <div className="ey">Plan</div>
          <b>{inrP(price)}<small style={{ fontSize: 14, color: 'var(--mut)' }}> / month</small></b>
        </div>
        <div className="c">
          <div className="ey">Status</div>
          <b style={{ fontSize: 30 }}>{active ? 'Active' : 'Not active'}</b>
        </div>
        <div className="c">
          <div className="ey">Paid to date</div>
          <b>{inrP(purchases?.total_paid_paise || 0)}</b>
        </div>
      </div>

      <div className="g3">
        <div className="c pn">
          <div className="ph">
            <b>Owner membership</b>
            <span className="dl">{active ? 'recurring' : 'not started'}</span>
          </div>
          {active ? (
            <>
              <p className="mt" style={{ margin: '0 0 6px' }}>
                Covered until <b style={{ color: 'var(--ink)' }}>{day(sub?.period_end)}</b> — {left} day{left === 1 ? '' : 's'} left.
              </p>
              <div className="bar">
                <i><s style={{ width: grew ? `${Math.max(4, Math.min(100, (left / (plan?.period_days || 30)) * 100))}%` : '0%' }} /></i>
                <span>{left} / {plan?.period_days || 30} days</span>
              </div>
            </>
          ) : (
            <p className="mt" style={{ margin: '0 0 6px' }}>
              Nothing has been charged yet. The plan unlocks listings, requests and payouts.
            </p>
          )}
          <p className="mt" style={{ margin: '18px 0 14px' }}>
            One payment covers {plan?.period_days || 30} days. Paying before it runs out simply
            adds another period, so no day is lost. Renters pay nothing, ever.
          </p>
          {err && <div className="alert err" style={{ marginBottom: 12 }}>{err}</div>}
          <button className="b" disabled={busy} onClick={pay}>
            {busy ? 'Processing…' : active ? `Extend by ${plan?.period_days || 30} days — ${inrP(price)}` : `Start membership — ${inrP(price)}`}
          </button>
        </div>

        <div className="c pn">
          <div className="ph">
            <b>Cover</b>
          </div>
          <div className="ln" style={{ padding: '12px 0', borderTop: 0 }}>
            <span className="mt">Started</span>
            <b>{day(sub?.period_start)}</b>
          </div>
          <div className="ln" style={{ padding: '12px 0' }}>
            <span className="mt">Renews / expires</span>
            <b>{day(sub?.period_end)}</b>
          </div>
          <div className="ln" style={{ padding: '12px 0' }}>
            <span className="mt">Last charge</span>
            <b>{rows.length ? inrP(rows[0].amount_paise) : '—'}</b>
          </div>
          <div className="ln" style={{ padding: '12px 0' }}>
            <span className="mt">Payments</span>
            <b>{purchases?.purchase_count || 0}</b>
          </div>
        </div>
      </div>

      <div className="c pn">
        <div className="ph">
          <b>Purchases</b>
          <span className="dl">{rows.length} receipt{rows.length === 1 ? '' : 's'}</span>
        </div>
        {rows.length === 0 && (
          <p className="mt" style={{ padding: '6px 0 10px' }}>
            No payments yet. Your first {inrP(price)} charge appears here with its date and status.
          </p>
        )}
        {rows.map((t) => (
          <div className="ln" key={t.id}>
            <span>
              <b>{t.note || 'Owner membership'}</b>
              <small className="mt" style={{ display: 'block' }}>
                {day(t.created_at)} · {t.method || 'online'} · ref {String(t.id).slice(0, 8)}
              </small>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <em className="dl" style={{
                color: t.status === 'captured' ? 'var(--ok)' : 'var(--mut)',
                background: t.status === 'captured' ? 'color-mix(in srgb, var(--ok) 13%, transparent)' : 'var(--line)',
              }}>{t.status}</em>
              <b>{inrP(t.amount_paise)}</b>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
