/**
 * Small formatting + mapping helpers shared by every OwnerHub section.
 *
 * The reference panel hard-coded its numbers; ours come from Postgres in
 * paise, so the money helpers convert at the edge instead of every call site
 * doing the arithmetic.
 */

/** Whole rupees, grouped the Indian way (1,23,456). */
export const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

/** Paise -> ₹ string. */
export const inrP = (paise) => inr((Number(paise) || 0) / 100);

/** Stable hue from a name, so the same renter always gets the same avatar. */
export const hue = (s) =>
  [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) * 7 % 360;

export const avatarBg = (name) => `hsl(${hue(name)} 45% 42%)`;

export const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
};

/** The reference draws four body shells; the API also ships `luxury`. */
export const bodyOf = (category) => {
  const c = String(category || '').toLowerCase();
  if (c === 'hatchback') return 'Hatchback';
  if (c === 'suv' || c === 'luxury') return 'Suv';
  if (c === 'van') return 'Van';
  return 'Sedan';
};

/** `2026-10-18` or a full timestamp -> '18 Oct'. */
export const shortDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(+d) ? String(v) : d.toLocaleDateString('en', { day: 'numeric', month: 'short' });
};

/** '18 Oct' + '21 Oct' -> '18 – 21 Oct' (the reference's range shape). */
export const rangeLabel = (start, end) => {
  if (!start) return '';
  const a = new Date(start);
  const b = end ? new Date(end) : a;
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth
    ? `${a.getDate()} – ${b.getDate()} ${b.toLocaleDateString('en', { month: 'short' })}`
    : `${shortDate(start)} – ${shortDate(end)}`;
};

export const dayCount = (start, end) => {
  if (!start) return 1;
  const a = new Date(start);
  const b = end ? new Date(end) : a;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
};

/** '2 days ago' for the notification and review lists. */
export const relTime = (v) => {
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(v).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * The panel's three request tabs map onto booking status values rather than
 * the reference's a/d/p shorthand.
 */
export const TAB_OF = {
  requested: 'p',
  pending: 'p',
  confirmed: 'a',
  approved: 'a',
  ongoing: 'a',
  completed: 'a',
  rejected: 'd',
  declined: 'd',
  cancelled: 'd',
};

/** Body colours offered in the Add-a-car swatch row. */
export const COLORS = ['#b3262f', '#1f3b73', '#3a3f49', '#dcd8cf', '#1f5a45', '#aab1bc'];

/**
 * Paint for the procedural car art.
 *
 * fleet.cars has no colour column, so the illustration's colour is derived from
 * the car's own id: stable per car across renders and reloads, and different
 * between two Swifts on the same page, without inventing a field the API
 * doesn't have.
 */
const PAINT = ['#b3262f', '#1f3b73', '#3a3f49', '#dcd8cf', '#1f5a45', '#aab1bc', '#7a4a12', '#2c2c34'];

export const carColor = (seed) => {
  let h = 0;
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PAINT[h % PAINT.length];
};

/** Local `YYYY-MM-DD` for today, for past-day disabling in the date grids. */
export const pad2 = (n) => String(n).padStart(2, '0');
export const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
};
