import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data.jsx';
import { api } from '../api.js';
import { pad2, todayISO } from '../lib.js';

/**
 * One month grid for the whole fleet: every booking from /bookings/requests
 * and /bookings/completed paints a chip on each day it covers, and every day
 * that ANY active car has blocked (is_available falsy on /cars/:id/availability)
 * gets a muted "N blocked" marker. Both views are read-only — the grid exists
 * to answer "what does this month look like" at a glance, not to mutate state.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Local-day ISO helpers. Booking dates are plain YYYY-MM-DD and new Date()
// would parse them as UTC, shifting a day backwards in negative-offset
// zones — fatal for a grid keyed on exact days.
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = (s) => {
  const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const isPending = (b) => b.status === 'requested' || b.status === 'pending';

export default function Calendar() {
  const { cars, requests, completed } = useData();
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [blocked, setBlocked] = useState(new Map()); // date ISO -> number of cars blocked
  const [ready, setReady] = useState(false);         // first availability round done

  const y = month.getFullYear();
  const m = month.getMonth();

  // Availability is per-car, per-displayed-month. The `live` flag keeps a fast
  // double-click on › from letting the previous month's responses overwrite
  // the current map; per-car .catch degrades to "no markers" instead of an
  // error page when the endpoint is down.
  useEffect(() => {
    let live = true;
    const from = iso(month);
    const to = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0)); // last day of the displayed month
    const active = (cars || []).filter((c) => c.status === 'active');

    if (!active.length) { setBlocked(new Map()); setReady(true); return () => { live = false; }; }

    Promise.all(active.map((c) => api(`/cars/${c.id}/availability?from=${from}&to=${to}`).catch(() => null)))
      .then((lists) => {
        if (!live) return;
        const map = new Map();
        for (const list of lists) {
          if (!Array.isArray(list)) continue;
          for (const r of list) {
            if (!r || r.is_available) continue; // only falsy is_available counts as blocked
            const key = String(r.date || '').slice(0, 10);
            if (key) map.set(key, (map.get(key) || 0) + 1);
          }
        }
        setBlocked(map);
        setReady(true);
      })
      .catch(() => { if (live) { setBlocked(new Map()); setReady(true); } });

    return () => { live = false; };
  }, [month, cars]);

  // Day ISO -> bookings covering it, so each cell is a single Map lookup.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const b of [...(requests || []), ...(completed || [])]) {
      const a = parseISO(b.start_date);
      if (!a) continue;
      const z = parseISO(b.end_date) || a;
      for (const t = new Date(a); t <= z; t.setDate(t.getDate() + 1)) {
        const key = iso(t);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(b);
      }
    }
    return map;
  }, [requests, completed]);

  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = todayISO();

  // Pad to whole weeks so column alignment holds without per-row markup.
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const monthHasBookings = Array.from({ length: daysInMonth }, (_, i) => byDay.has(iso(new Date(y, m, i + 1)))).some(Boolean);
  const shift = (n) => setMonth(new Date(y, m + n, 1));

  return (
    <div className="wrap">
      <div className="hd">
        <div>
          <p className="ey">Fleet calendar</p>
          <h2>{first.toLocaleDateString('en', { month: 'long' })} <em>{y}</em></h2>
          <p className="mt">Bookings across your fleet, plus days blocked on any active car</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="ib" aria-label="Previous month" onClick={() => shift(-1)}>
            <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button className="o" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
          <button className="ib" aria-label="Next month" onClick={() => shift(1)}>
            <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <div className="card">
        {/* Skeleton only for the first round; month flips just swap the map. */}
        {!ready ? (
          <>
            <div className="sk" />
            <div className="sk" />
            <div className="sk" />
          </>
        ) : (
          <div>
            <div className="cg">
              {WEEKDAYS.map((w) => <div key={w} className="cw">{w}</div>)}
            </div>
            <div className="cg" style={{ cursor: 'pointer' }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={`x${i}`} className="cl e" />;
                const key = iso(new Date(y, m, d));
                const dayBookings = byDay.get(key) || [];
                const n = blocked.get(key) || 0;
                return (
                  <div key={key} className={`cl${key === today ? ' t' : ''}`}>
                    <b>{d}</b>
                    {dayBookings.map((b) => (
                      <span
                        key={b.id}
                        className={`ct${isPending(b) ? ' p' : ''}`}
                        title={`${b.car?.brand || ''} ${b.car?.model || ''} · ${b.status}`}
                      >
                        {b.car?.brand} {b.car?.model}
                      </span>
                    ))}
                    {n > 0 && <div className="mt" style={{ fontSize: 11 }}>{n} blocked</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {ready && !monthHasBookings && (
        <div className="empty-state-section mt-12">
          <div className="empty-icon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
          </div>
          <p className="muted">No bookings this month — blocked days still show up above.</p>
        </div>
      )}
    </div>
  );
}
