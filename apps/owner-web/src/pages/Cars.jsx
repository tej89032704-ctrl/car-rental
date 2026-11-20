import { useEffect, useMemo, useState } from 'react';
import { api, sessionUser } from '../api.js';
import { useCarStats, useData } from '../data.jsx';
import { carColor, greet, inr, inrP, pad2, shortDate, todayISO } from '../lib.js';
import { useOverlay } from '../ui.jsx';
import CarArt from '../CarArt.jsx';

/**
 * The fleet dashboard: greeting, a four-card live strip, a 30-day revenue
 * panel beside today's events, a filter bar, and the fleet grid.
 *
 * Every figure is derived from what the API already returned -- there is no
 * simulated ticker here. The reference bumped "earned today" on a timer to look
 * live; ours counts up only when the server says it moved.
 */

const dayKey = (v) => {
  const d = new Date(v);
  if (Number.isNaN(+d)) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const toDate = (v) => {
  const s = String(v || '');
  return new Date(s.length === 10 ? `${s}T00:00:00` : s);
};

/** Live countdown to a date-only pick-up. Isolated so the whole dashboard
 *  does not re-render every second behind 22 procedural cars. */
function Countdown({ iso }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = +toDate(iso);
  if (Number.isNaN(t)) return <>—</>;
  const ms = t - now;
  if (ms <= 0) return <>Today</>;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor(ms / 3600000) % 24;
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  if (d > 0) return <>{d}d {pad2(h)}h {pad2(m)}m</>;
  return <>{pad2(h)}:{pad2(m)}:{pad2(s)}</>;
}

/** 30 daily buckets ending today, in paise. */
function useDailySeries(source, days = 30) {
  return useMemo(() => {
    const byDay = new Map();
    for (const row of source || []) {
      const k = dayKey(row.created_at);
      if (!k) continue;
      byDay.set(k, (byDay.get(k) || 0) + (Number(row.amount_paise) || 0));
    }
    const out = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      out.push({ k, v: byDay.get(k) || 0 });
    }
    return out;
  }, [source, days]);
}

function Spark({ series }) {
  const w = 260;
  const h = 50;
  const max = Math.max(...series.map((d) => d.v), 1);
  const pts = series.map((d, i) => {
    const x = series.length > 1 ? (i / (series.length - 1)) * w : 0;
    const y = h - (d.v / max) * (h - 6) - 3;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return (
    <svg className="spk" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="ln2" d={`M${pts.join('L')}`} fill="none" stroke="var(--acc)" strokeWidth="2"
        vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function AreaChart({ series }) {
  const w = 600;
  const h = 180;
  const max = Math.max(...series.map((d) => d.v), 1);
  const step = series.length > 1 ? w / (series.length - 1) : w;
  const pts = series.map((d, i) => `${(i * step).toFixed(1)} ${(h - (d.v / max) * (h - 24) - 12).toFixed(1)}`);
  const line = `M${pts.join('L')}`;
  return (
    <svg className="rc" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line}L${w} ${h}L0 ${h}Z`} fill="color-mix(in srgb, var(--acc) 15%, transparent)" />
      <path className="ln2" d={line} fill="none" stroke="var(--acc)" strokeWidth="2.5"
        vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Cars() {
  const { cars, requests, completed, earnings, errors, reload } = useData();
  const stats = useCarStats();
  const open = useOverlay().open;
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');

  const me = sessionUser();
  const firstName = (me?.name || 'there').split(' ')[0];

  const series = useDailySeries(earnings?.transactions, 30);
  const spark = series.slice(-14);
  const today = todayISO();

  const activeCount = cars.filter((c) => c.status === 'active').length;
  const ongoing = requests.filter((b) => b.status === 'ongoing').length;
  const upcoming = requests.filter((b) => b.status === 'confirmed' && dayKey(b.start_date) >= today);
  const nextPickup = [...upcoming].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0];

  const earnedToday = series[series.length - 1]?.v || 0;
  const earned30 = series.reduce((s, d) => s + d.v, 0);
  const pct = cars.length ? Math.round((activeCount / cars.length) * 100) : 0;

  const events = useMemo(() => {
    const out = [];
    for (const b of [...(requests || []), ...(completed || [])]) {
      if (dayKey(b.start_date) === today) {
        out.push({ kind: 'Pick-up', b });
      }
      if (dayKey(b.end_date) === today) {
        out.push({ kind: 'Drop-off', b });
      }
    }
    return out.slice(0, 4);
  }, [requests, completed, today]);

  const shown = cars.filter((c) => {
    const live = c.status === 'active';
    if (filter === 'live' && !live) return false;
    if (filter === 'paused' && live) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return `${c.make} ${c.model} ${c.plate_number}`.toLowerCase().includes(needle);
  });

  async function toggleCar(e, car) {
    e.stopPropagation();
    const next = car.status === 'active' ? 'inactive' : 'active';
    setBusy(car.id);
    try {
      await api(`/cars/${car.id}`, { method: 'PATCH', body: { status: next } });
      await reload();
    } catch (err) {
      // Surfaced through the card's own status line rather than a toast, so a
      // rejected transition never looks like it silently did nothing.
      setBusy(`err:${car.id}:${err.message}`);
    } finally {
      setBusy('');
    }
  }

  const toggleError = typeof busy === 'string' && busy.startsWith('err:') ? busy : '';

  if (errors.cars) {
    return (
      <div className="wrap">
        <div className="alert err">{errors.cars}</div>
        <button className="b" onClick={() => reload()}>Retry</button>
      </div>
    );
  }

  return (
    <>
      <div className="hd">
        <div>
          <div className="ey">Fleet</div>
          <h2>{greet()} <em>{firstName}</em></h2>
          <p>{activeCount} of {cars.length} cars accepting bookings</p>
        </div>
        <button className="b" onClick={() => open('addCar')}>Add a car</button>
      </div>

      <div className="lv">
        <div className="c">
          <div className="ey">Earned today</div>
          <b>{inr(earnedToday / 100)}</b>
          <div className="mt">{inr(earned30 / 100)} over the last 30 days</div>
          <Spark series={spark} />
        </div>

        <div className="c">
          <div className="ey">Trips on the road</div>
          <b>{ongoing}</b>
          <div className="mt">{upcoming.length} pick-up{upcoming.length === 1 ? '' : 's'} queued</div>
          <div className="trk"><i /></div>
        </div>

        <div className="c">
          <div className="ey">Next pick-up</div>
          <b><Countdown iso={nextPickup?.start_date} /></b>
          <div className="mt">
            {nextPickup
              ? `${nextPickup.car?.brand} ${nextPickup.car?.model} · ${shortDate(nextPickup.start_date)}`
              : 'Nothing booked next'}
          </div>
        </div>

        <div className="c">
          <div className="ey">Fleet utilisation</div>
          <b>{pct}%</b>
          <div className="mt">{activeCount} of {cars.length} live</div>
          <div className="bar"><i><s style={{ width: `${pct}%` }} /></i></div>
        </div>
      </div>

      <div className="g3">
        <div className="c pn">
          <div className="ph">
            <b>Revenue, 30 days</b>
            <span className="dl">{inr(earned30 / 100)}</span>
          </div>
          <AreaChart series={series} />
        </div>

        <div className="c pn">
          <div className="ph"><b>Today</b><span className="dl">{events.length} event{events.length === 1 ? '' : 's'}</span></div>
          {events.length === 0 && <p className="mt">Nothing scheduled for {shortDate(new Date())}.</p>}
          {events.map((e, i) => (
            <div className="ev" key={`${e.b.id}-${e.kind}-${i}`}>
              <span>{shortDate(e.kind === 'Pick-up' ? e.b.start_date : e.b.end_date)}</span>
              <div>
                <b>{e.kind} · {e.b.car?.brand} {e.b.car?.model}</b>
                <small>{e.b.renter?.name || 'Renter'} · {inrP(e.b.total_amount_paise)}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fd">
        <div className="chs">
          {[['all', 'All'], ['live', 'Approved'], ['paused', 'Paused']].map(([k, label]) => (
            <button key={k} className={`ch2 ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        <label className="sq">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your fleet" aria-label="Search your fleet" />
        </label>
      </div>

      {toggleError && <div className="alert err">{toggleError.replace(/^err:[^:]*:/, '')}</div>}

      {shown.length === 0 && (
        <div className="empty-state-section">
          <div className="empty-icon">🚗</div>
          <p>{cars.length === 0 ? 'No cars yet — add your first one.' : 'No cars match this filter.'}</p>
          {cars.length === 0 && <button className="b" style={{ marginTop: 14 }} onClick={() => open('addCar')}>Add a car</button>}
        </div>
      )}

      <div className="gr">
        {shown.map((car) => {
          const s = stats.get(car.id) || { trips: 0, earned: 0 };
          const live = car.status === 'active';
          const toggleable = car.status === 'active' || car.status === 'inactive';
          return (
            <div
              className="c"
              data-x="car"
              key={car.id}
              role="button"
              tabIndex={0}
              onClick={() => open('car', car.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') open('car', car.id); }}
            >
              <div className="stage">
                <div className="chip">
                  <span className={`dot ${live ? '' : 'off'}`} />
                  {live ? 'Approved' : car.status === 'pending_review' ? 'In review' : car.status.replace('_', ' ')}
                </div>
                <CarArt category={car.category} color={carColor(car.id)} />
              </div>
              <div className="bd">
                <h3>{car.make} {car.model}</h3>
                <p className="mt">{car.plate_number} · {car.year}</p>
                <div className="tri">
                  <div><b>{car.daily_rate_paise ? inr(car.daily_rate_paise / 100) : '—'}</b><small>per day</small></div>
                  <div><b>{s.trips}</b><small>trips</small></div>
                  <div><b>{s.earned ? inrP(s.earned) : '₹0'}</b><small>earned</small></div>
                </div>
                <div className="sw">
                  <span>{toggleable ? 'Accepting bookings' : 'Awaiting approval'}</span>
                  {toggleable ? (
                    <button
                      type="button"
                      className={`tg ${live ? 'on' : ''}`}
                      role="switch"
                      aria-checked={live}
                      aria-label={`${car.make} ${car.model} accepting bookings`}
                      disabled={busy === car.id}
                      onClick={(e) => toggleCar(e, car)}
                    />
                  ) : (
                    <span className="pill">{car.status === 'pending_review' ? 'In review' : car.status}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
