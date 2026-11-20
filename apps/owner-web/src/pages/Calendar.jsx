import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data.jsx';
import { useToast } from '../ui.jsx';
import { todayISO } from '../lib.js';
import {
  iso,
  eachDay,
  holdsCar,
  fetchMonth,
  flipDay,
  pendingChanges,
  saveDays,
  conflictingDays,
  dayBlockedWarning,
  saveConflictWarning,
  shownAvailable,
  tripLabel,
} from '../availability.js';

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
 *
 * A day a booking covers is not a block candidate: the API writes
 * car_availability without looking at bookings, so tapping one would quietly
 * put a hatch over a confirmed trip. Those days refuse the tap with an
 * explanation, and Save re-reads the owner's bookings before writing, so a trip
 * that landed while the page was open cannot be blocked behind the owner's
 * back either. All of that -- the read, the draft diff, the write and the
 * booking guard -- lives in ../availability.js so the car drawer behaves
 * identically; this page keeps the grid, the month's own state and the copy.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isPending = (b) => b.status === 'requested' || b.status === 'pending';

export default function Calendar() {
  const { cars, requests, completed, reload } = useData();
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
  // A tap or Save that was refused because a booking owns the day. Kept apart
  // from `err` so it can read as guidance rather than a failure, and so it can
  // offer the reload that fixes stale booking data.
  const [warn, setWarn] = useState('');

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
    setReady(false);
    fetchMonth(carId, month)
      .then((map) => {
        if (!live) return;
        setAvail(map);
        setDraft(new Map());
        setErr('');
        setWarn('');
        setReady(true);
      })
      .catch((e) => { if (live) { setAvail(new Map()); setDraft(new Map()); setErr(e.message); setReady(true); } });
    return () => { live = false; };
  }, [carId, month]);

  // Day ISO -> every booking covering it, for the chips. The guard below reads
  // the same map, so the month is walked once.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const b of [...(requests || []), ...(completed || [])]) {
      eachDay(b.start_date, b.end_date, (key) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(b);
      });
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
  // otherwise the server's answer.
  const isAvailable = (key) => shownAvailable(draft, avail, key);

  // This car's own trip on a day, if any. The chips above show the whole fleet;
  // only this car's trips can be hidden by blocking this car's days.
  const tripOn = (key) => (byDay.get(key) || []).find((b) => b.car_id === car?.id && holdsCar(b));

  function toggleDay(key) {
    if (!car || key < today) return;
    setErr('');
    setWarn('');
    // Only blocking can hide a trip; reopening a day that is already closed is
    // always safe and stays available.
    const trip = tripOn(key);
    if (isAvailable(key) && trip) {
      setWarn(dayBlockedWarning(key, trip));
      return;
    }
    setDraft((prev) => flipDay(prev, avail, key));
  }

  const { block, unblock } = pendingChanges(draft);
  const dirty = block.length + unblock.length;

  async function save() {
    if (!car || (!block.length && !unblock.length)) return;
    setErr('');
    setWarn('');
    setSaving(true);
    try {
      // Bookings can arrive between the load and the Save click, so the guard
      // re-reads them (shared with the drawer) instead of trusting this page's
      // copy. A clash refuses the whole write rather than half-applying it over
      // a trip: the grid is stale, and the honest next step is a fresh read.
      const clashes = await conflictingDays(car.id, block);
      if (clashes.length) {
        setWarn(saveConflictWarning(clashes));
        return;
      }
      await saveDays(car.id, { block, unblock });
      const parts = [];
      if (block.length) parts.push(`${block.length} day${block.length === 1 ? '' : 's'} blocked`);
      if (unblock.length) parts.push(`${unblock.length} reopened`);
      toast(parts.join(' · '));
      // Re-read rather than assuming: the server decides what a day now looks like.
      setAvail(await fetchMonth(car.id, month));
      setDraft(new Map());
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wrap">
      <div className="hd">
        <div>
          <p className="ey">Fleet calendar</p>
          <h2>{first.toLocaleDateString('en', { month: 'long' })} <em>{y}</em></h2>
          <p className="mt">
            {car
              ? `Tap a day to block or reopen it for ${car.make} ${car.model} (${car.plate_number}). Days a booking covers stay open.`
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

      {warn && (
        <div className="alert info" style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }} role="status">
          <span style={{ flex: 1, minWidth: 220 }}><b>Can’t block.</b> {warn}</span>
          <button className="o" type="button" onClick={() => { setWarn(''); reload?.(); }}>Refresh bookings</button>
        </div>
      )}

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
                // This car's own trip on this day: the cell says so, and the tap
                // is refused below rather than silently hatching over it.
                const booking = tripOn(key);
                const trip = booking ? tripLabel(booking) : '';
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
                    className={`cl${key === today ? ' t' : ''}${blocked ? ' blk' : ''}${touched ? ' touched' : ''}${booking && !blocked ? ' bkd' : ''}`}
                    onClick={() => toggleDay(key)}
                    aria-pressed={blocked}
                    title={booking && !blocked ? `Covered by ${trip} — cannot block` : undefined}
                    aria-label={`${key} ${blocked ? 'blocked, tap to reopen' : booking ? `covered by ${trip}, cannot block` : 'available, tap to block'} for ${car.make} ${car.model}`}
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

