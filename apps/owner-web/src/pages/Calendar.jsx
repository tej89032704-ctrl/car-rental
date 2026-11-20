import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data.jsx';
import { api } from '../api.js';
import { useToast } from '../ui.jsx';
import { pad2, todayISO } from '../lib.js';

/**
 * The fleet's month at a glance, and the place an owner blocks days.
 *
 * Bookings from every car still paint a chip on each day they cover, so the
 * month reads as a whole. On top of that one *approved* car is selected and its
 * days become pick targets: tapping a day queues a block (or lifts one), and
 * Save writes the queue through PUT /cars/:id/availability -- the same endpoint
 * the car drawer and the car page use, so all three stay in agreement.
 *
 * Changes are queued rather than written per tap for the same reason the drawer
 * does it: a week of maintenance is one round trip, and a mis-tap costs nothing
 * until Save. Switching car or month drops the queue, which the header says out
 * loud so a lost block is never a surprise.
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
  const toast = useToast();

  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [carId, setCarId] = useState('');
  // date ISO -> is_available as the server has it
  const [avail, setAvail] = useState(new Map());
  // date ISO -> is_available as the owner wants it (only days they touched)
  const [draft, setDraft] = useState(new Map());
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const y = month.getFullYear();
  const m = month.getMonth();

  // Only an approved car can be paused day by day: a draft or a car in review
  // is not bookable, so blocking it would be busywork.
  const approved = useMemo(() => (cars || []).filter((c) => c.status === 'active'), [cars]);
  const car = approved.find((c) => c.id === carId) || null;

  // Default to the first approved car once the fleet has loaded.
  useEffect(() => {
    if (!carId && approved.length) setCarId(approved[0].id);
    if (carId && !approved.some((c) => c.id === carId)) setCarId(approved[0]?.id || '');
  }, [approved, carId]);

  // The selected car's availability for the displayed month. The `live` flag
  // keeps a fast double-click on › from letting the previous month's response
  // land on the new grid.
  useEffect(() => {
    if (!carId) { setAvail(new Map()); setDraft(new Map()); setReady(true); return () => {}; }
    let live = true;
    const from = iso(month);
    const to = iso(new Date(y, m + 1, 0)); // last day of the displayed month
    setReady(false);
    api(`/cars/${carId}/availability?from=${from}&to=${to}`)
      .then((rows) => {
        if (!live) return;
        const map = new Map();
        for (const r of rows || []) {
          if (!r || !r.date) continue;
          map.set(String(r.date).slice(0, 10), r.is_available === true || r.is_available === 1);
        }
        setAvail(map);
        setDraft(new Map());
        setErr('');
        setReady(true);
      })
      .catch((e) => { if (live) { setAvail(new Map()); setDraft(new Map()); setErr(e.message); setReady(true); } });
    return () => { live = false; };
  }, [carId, month]);

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

  // What the grid should show for a day: the draft when the owner touched it,
  // otherwise the server's answer. A day with no row is available.
  const isAvailable = (key) => (draft.has(key) ? draft.get(key) : (avail.has(key) ? avail.get(key) : true));

  function toggleDay(key) {
    if (!car || key < today) return;
    setErr('');
    setDraft((prev) => {
      const next = new Map(prev);
      next.set(key, !isAvailable(key));
      // A tap that lands back on the server's value is not a change.
      const server = avail.has(key) ? avail.get(key) : true;
      if (next.get(key) === server) next.delete(key);
      return next;
    });
  }

  const block = [...draft].filter(([, av]) => !av).map(([d]) => d);
  const unblock = [...draft].filter(([, av]) => av).map(([d]) => d);

  async function save() {
    if (!car || (!block.length && !unblock.length)) return;
    setSaving(true);
    setErr('');
    try {
      if (block.length) {
        await api(`/cars/${car.id}/availability`, {
          method: 'PUT',
          body: { dates: block, is_available: false, reason: 'Blocked by owner' },
        });
      }
      if (unblock.length) {
        await api(`/cars/${car.id}/availability`, {
          method: 'PUT',
          body: { dates: unblock, is_available: true },
        });
      }
      const parts = [];
      if (block.length) parts.push(`${block.length} day${block.length === 1 ? '' : 's'} blocked`);
      if (unblock.length) parts.push(`${unblock.length} reopened`);
      toast(parts.join(' · '));
      // Re-read rather than assuming: the server decides what a day now looks like.
      const from = iso(month);
      const to = iso(new Date(y, m + 1, 0));
      const rows = await api(`/cars/${car.id}/availability?from=${from}&to=${to}`);
      const map = new Map();
      for (const r of rows || []) {
        if (!r || !r.date) continue;
        map.set(String(r.date).slice(0, 10), r.is_available === true || r.is_available === 1);
      }
      setAvail(map);
      setDraft(new Map());
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = dirtyFrom(draft, avail);

  return (
    <div className="wrap">
      <div className="hd">
        <div>
          <p className="ey">Fleet calendar</p>
          <h2>{first.toLocaleDateString('en', { month: 'long' })} <em>{y}</em></h2>
          <p className="mt">
            {car
              ? `Tap a day to block or reopen it for ${car.make} ${car.model} (${car.plate_number}).`
              : 'Bookings across your fleet. Add and approve a car to block its days here.'}
          </p>
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

      {approved.length > 0 && (
        <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="f" style={{ display: 'flex', gap: 10, alignItems: 'center', maxWidth: 420 }}>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>Car</span>
            <select
              className="f"
              value={carId}
              onChange={(e) => { setCarId(e.target.value); setDraft(new Map()); setErr(''); }}
              aria-label="Car to block days for"
            >
              {approved.map((c) => (
                <option key={c.id} value={c.id}>{c.make} {c.model} · {c.plate_number}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginLeft: 'auto' }}>
            {dirty > 0 && <span className="muted" style={{ fontSize: 13 }}>{dirty} unsaved</span>}
            <button className="o" disabled={!dirty || saving} onClick={() => setDraft(new Map())}>Discard</button>
            <button className="b" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {err && <div className="alert err" style={{ marginTop: 12 }}>{err}</div>}

      <div className="card">
        {/* Skeleton only for the first round; month flips just swap the grid. */}
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
            <div className="cg">
              {cells.map((d, i) => {
                if (d === null) return <div key={`x${i}`} className="cl e" />;
                const key = iso(new Date(y, m, d));
                const dayBookings = byDay.get(key) || [];
                const blocked = !isAvailable(key);
                const touched = draft.has(key);
                const past = key < today;
                const body = (
                  <>
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
                    {blocked && <span className="ct p" title="Not bookable on this day">blocked</span>}
                  </>
                );

                // Days are pick targets only when a car is selected and the day
                // is not behind us; otherwise the cell stays a plain div so the
                // month still reads as an overview.
                if (!car || past) {
                  return (
                    <div key={key} className={`cl${key === today ? ' t' : ''}${blocked ? ' blk' : ''}`}>
                      {body}
                    </div>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    className={`cl${key === today ? ' t' : ''}${blocked ? ' blk' : ''}${touched ? ' touched' : ''}`}
                    onClick={() => toggleDay(key)}
                    aria-pressed={blocked}
                    aria-label={`${key} ${blocked ? 'blocked, tap to reopen' : 'available, tap to block'} for ${car.make} ${car.model}`}
                  >
                    {body}
                  </button>
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
          <p className="muted">
            No bookings this month{car ? ' — blocked days are the hatched ones.' : '.'}
          </p>
        </div>
      )}
    </div>
  );
}

/** How many days the owner has touched that differ from the server's answer. */
function dirtyFrom(draft, avail) {
  let n = 0;
  for (const [key, want] of draft) {
    const server = avail.has(key) ? avail.get(key) : true;
    if (want !== server) n += 1;
  }
  return n;
}
