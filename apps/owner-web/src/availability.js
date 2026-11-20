/**
 * Day availability for one car, in one place.
 *
 * Two surfaces let an owner block and reopen days -- the Calendar page and the
 * car drawer. Both need the same mechanics: the month's bounds, a normalised
 * GET, the owner's queued taps diffed into a block list and a reopen list, the
 * PUT that writes them, and the rule that a day a booking covers cannot be
 * blocked. Keeping that here is what stops the two surfaces drifting apart.
 *
 * The pages keep only what is theirs: grid layout, copy and local UI state.
 */

import { api } from './api.js';
import { pad2 } from './lib.js';

/**
 * Local-day ISO. Booking dates are plain YYYY-MM-DD and `new Date('2026-11-28')`
 * parses as UTC, which shifts a day backwards in negative-offset zones -- fatal
 * for a grid keyed on exact days.
 */
export const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function parseISO(s) {
  const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** Calls `visit(dayISO)` for every day from `start` to `end`, inclusive. */
export function eachDay(start, end, visit) {
  const a = parseISO(start);
  if (!a) return;
  const z = parseISO(end) || a;
  for (const t = new Date(a); t <= z; t.setDate(t.getDate() + 1)) visit(iso(t));
}

/**
 * Statuses that hold the car for those days. A rejected or cancelled booking
 * frees them again; everything else -- including a request nobody has answered
 * yet -- is a trip an owner would be hiding by blocking the day.
 */
const OCCUPYING = new Set(['requested', 'pending', 'confirmed', 'ongoing', 'completed']);

export const holdsCar = (b) => !!b && OCCUPYING.has(b.status);

/**
 * Day ISO -> the booking that owns it for one car.
 *
 * Takes the booking list as an argument rather than reading component state so
 * a save can call it with a freshly fetched list: the map built at load time is
 * exactly the stale view a new booking can slip past.
 */
export function bookedDays(carId, bookings) {
  const map = new Map();
  if (!carId) return map;
  for (const b of bookings || []) {
    if (!b || b.car_id !== carId || !holdsCar(b)) continue;
    eachDay(b.start_date, b.end_date, (key) => {
      if (!map.has(key)) map.set(key, b);
    });
  }
  return map;
}

/** "2026-11-28" -> "28 Nov 2026", for messages a person reads. */
function dayLabel(key) {
  const d = parseISO(key);
  return d ? d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : key;
}

/** "a requested booking (27 Nov 2026 → 29 Nov 2026)". */
export function tripLabel(trip) {
  if (!trip) return 'a booking';
  const span = trip.start_date === trip.end_date
    ? dayLabel(trip.start_date)
    : `${dayLabel(trip.start_date)} → ${dayLabel(trip.end_date)}`;
  return `a ${trip.status} booking (${span})`;
}

/** The server's answer for a day. A day with no row is available. */
export const isAvailable = (serverMap, day) => (serverMap.has(day) ? serverMap.get(day) : true);

/** What the owner should see: their queued answer, else the server's. */
export const shownAvailable = (draft, serverMap, day) =>
  (draft.has(day) ? draft.get(day) : isAvailable(serverMap, day));

/** One month of availability for one car, as a Map of day -> available. */
export async function fetchMonth(carId, month) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const from = iso(new Date(y, m, 1));
  const to = iso(new Date(y, m + 1, 0));
  const rows = await api(`/cars/${carId}/availability?from=${from}&to=${to}`);
  const map = new Map();
  for (const r of rows || []) {
    if (r && r.date) map.set(String(r.date).slice(0, 10), r.is_available === true || r.is_available === 1);
  }
  return map;
}

/**
 * Queue one tap. `draft` is Map(day -> wanted availability) holding only the
 * days the owner has touched; a tap that lands back on the server's value drops
 * the entry, so the draft never carries a no-op.
 */
export function flipDay(draft, serverMap, day) {
  const next = new Map(draft);
  const server = isAvailable(serverMap, day);
  const want = !(draft.has(day) ? draft.get(day) : server);
  if (want === server) next.delete(day);
  else next.set(day, want);
  return next;
}

/**
 * The two writes a draft implies. Every draft entry differs from the server it
 * was built against -- flipDay drops the rest, and both surfaces clear the
 * draft whenever they re-read availability -- so no comparison is needed here.
 */
export function pendingChanges(draft) {
  const block = [];
  const unblock = [];
  for (const [day, want] of draft) (want ? unblock : block).push(day);
  return { block, unblock };
}

/**
 * Write a set of blocks and reopens. The only place that knows the endpoint, its
 * body shape and the default reason, so both surfaces block days identically.
 */
export async function saveDays(carId, { block = [], unblock = [], reason = 'Blocked by owner' } = {}) {
  if (block.length) {
    await api(`/cars/${carId}/availability`, {
      method: 'PUT',
      body: { dates: block, is_available: false, reason },
    });
  }
  if (unblock.length) {
    await api(`/cars/${carId}/availability`, {
      method: 'PUT',
      body: { dates: unblock, is_available: true },
    });
  }
}

/**
 * The days among `days` that a booking now covers, read fresh from the server.
 *
 * Saving must not trust the page's copy of the bookings: a trip can be
 * confirmed while the drawer or the calendar is open, and a stale read would
 * let the owner hatch over a live trip. A failed read throws (with a message
 * that already says nothing was written) rather than being treated as "clear".
 * The server refuses these blocks too, so this is the friendly check, not the
 * only one.
 */
export async function conflictingDays(carId, days) {
  if (!days.length) return [];
  let lists;
  try {
    lists = await Promise.all([api('/bookings/requests'), api('/bookings/completed')]);
  } catch (e) {
    throw new Error(`Could not confirm those days are still free (${e.message}), so nothing was saved. Try again in a moment.`);
  }
  const owned = bookedDays(carId, lists.flat());
  return days.filter((d) => owned.has(d));
}

/** Why a single day refused a block. */
export const dayBlockedWarning = (day, trip) =>
  `${dayLabel(day)} is part of ${tripLabel(trip)}. Blocking it would hide that trip, so the day was left open — cancel or move the booking first.`;

/** Why a save was refused outright. */
export const saveConflictWarning = (days) =>
  `${days.map(dayLabel).join(', ')} ${days.length === 1 ? 'is' : 'are'} now covered by a booking — nothing was saved. Refresh to pick up the latest trips, then redo the block if it is still needed.`;
