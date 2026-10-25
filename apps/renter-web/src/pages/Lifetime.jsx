import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { inr, inrPlain, monthShort } from '../components/ui.js';

const TIERS = [
  { name: 'Bronze', at: 0 },
  { name: 'Silver', at: 5 },
  { name: 'Gold', at: 10 },
  { name: 'Platinum', at: 17 },
];

function tierFor(trips) {
  let current = TIERS[0];
  for (const t of TIERS) if (trips >= t.at) current = t;
  const next = TIERS.find((t) => t.at > trips);
  return { current, next };
}

/** Six months back from today, oldest first. */
function monthsBack(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return out;
}

/** Smooth path through points, so the chart reads like the artwork's curve. */
function curve(points) {
  if (!points.length) return '';
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mx = (x0 + x1) / 2;
    d += `C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  return d;
}

export default function Lifetime() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/bookings/my')
      .then((bk) => {
        setBookings(Array.isArray(bk) ? bk : []);
        setErr('');
      })
      .catch((e) => setErr(e.message || 'Could not load your history'))
      .finally(() => setLoading(false));
  }, []);

  const { stats, chart } = useMemo(() => {
    const done = bookings.filter((b) => b.status === 'completed');
    const spent = done.reduce((s, b) => s + (b.total_amount_paise || 0), 0);
    const days = done.reduce((s, b) => {
      const a = new Date(`${String(b.start_date).slice(0, 10)}T00:00:00Z`);
      const z = new Date(`${String(b.end_date).slice(0, 10)}T00:00:00Z`);
      const n = Math.round((z - a) / 86400000);
      return s + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
    const cars = new Set(done.map((b) => b.car_id)).size;

    const months = monthsBack(6);
    const sums = months.map((m) => done.reduce((s, b) => {
      const d = new Date(`${String(b.start_date).slice(0, 10)}T00:00:00Z`);
      return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()
        ? s + (b.total_amount_paise || 0)
        : s;
    }, 0));
    const max = Math.max(...sums, 1);
    const points = sums.map((v, i) => [20 + (i * 560) / (sums.length - 1), 170 - (v / max) * 120]);

    return {
      stats: [
        { value: inr(spent), label: 'Total spent' },
        { value: String(done.length), label: 'Trips' },
        { value: String(days), label: 'Days on the road' },
        { value: String(cars), label: 'Cars driven' },
      ],
      chart: { points, sums, months, max },
    };
  }, [bookings]);

  const trips = bookings.filter((b) => b.status === 'completed').length;
  const { current, next } = tierFor(trips);
  const pct = next ? Math.min(100, Math.round(((trips - current.at) / (next.at - current.at)) * 100)) : 100;
  const path = curve(chart.points);
  const area = chart.points.length ? `${path}L580 200L20 200Z` : '';

  return (
    <section className="pg">
      <div className="hd">
        <div>
          <h1>Lifetime</h1>
          <p>Your journey with CAR-ENT so far.</p>
        </div>
      </div>

      {err && <div className="ce-err">{err}</div>}
      {loading && !err && <div className="ce-load"><span className="spinner" /><span>Adding up your trips…</span></div>}

      <div className="big">
        {stats.map((s) => (
          <div key={s.label}>
            <b data-t={s.value}>{s.value}</b>
            <small>{s.label}</small>
          </div>
        ))}
      </div>

      <div className="two">
        <div className="panel pad">
          <h3>Spend by month</h3>
          <svg viewBox="0 0 600 220" style={{ width: '100%', marginTop: 14 }} role="img" aria-label="Spend by month">
            <defs>
              <linearGradient id="ce-ar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f26a1b" stopOpacity=".45" />
                <stop offset="1" stopColor="#f26a1b" stopOpacity="0" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill="url(#ce-ar)" />}
            {path && <path d={path} fill="none" stroke="#f26a1b" strokeWidth="3" strokeLinecap="round" />}
            {chart.points.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="4" fill="#f26a1b" />
            ))}
            <g fill="var(--mu)" fontSize="12" fontFamily="Manrope">
              {chart.months.map((m, i) => (
                <text key={i} x={20 + (i * 560) / (chart.months.length - 1)} y="215" textAnchor={i === 0 ? 'start' : i === chart.months.length - 1 ? 'end' : 'middle'}>
                  {monthShort(m)}
                </text>
              ))}
            </g>
          </svg>
          <p className="muted" style={{ margin: 0 }}>
            {inrPlain((chart.max || 0) / 100)} in your best month.
          </p>
        </div>

        <div className="panel pad">
          <h3>{current.name} renter</h3>
          <p style={{ color: 'var(--mu)' }}>
            {next
              ? `${next.at - trips} more trip${next.at - trips === 1 ? '' : 's'} unlock ${next.name} and free doorstep delivery.`
              : 'Top tier reached — doorstep delivery is on us.'}
          </p>
          <div className="prog"><i style={{ width: `${pct}%` }} /></div>
          <small style={{ color: 'var(--mu)' }}>
            {trips} trip{trips === 1 ? '' : 's'}
            {next ? ` of ${next.at}` : ''}
          </small>
        </div>
      </div>

      {/* Renting carries no membership: the old one-time lifetime plan is
          retired, and owners are the only ones who pay for a plan. */}
      <div className="panel pad" style={{ marginTop: 22 }}>
        <h3 style={{ fontSize: 20 }}>Renting is free</h3>
        <p className="muted" style={{ margin: '8px 0 0', maxWidth: '62ch' }}>
          There is no joining fee, no monthly plan and no commission on your trips. You pay the
          car&apos;s rental (and any deposit the owner asks for) and nothing else.
        </p>
      </div>
    </section>
  );
}
