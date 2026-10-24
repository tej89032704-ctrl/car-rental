/* Shared behaviour for the CAR-ENT renter portal.
   Kept in plain functions (not React state) where the artwork's effect is
   purely presentational — a toast, a ripple or a confetti burst must not
   re-render a page that is busy searching. */

export function toast(message) {
  const el = document.getElementById('ce-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('on'), 2400);
}

/** The artwork's circular click ripple, anchored where the pointer landed. */
export function ripple(e) {
  const b = e.currentTarget;
  if (!b || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = b.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 1.6;
  const span = document.createElement('span');
  span.className = 'rp';
  span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  b.appendChild(span);
  setTimeout(() => span.remove(), 700);
}

/** The confetti burst the artwork fires when a quote is accepted. */
export function confetti(x, y) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#ff8a3d', '#ffe0a8', '#7b5cff', '#2fd37f', '#ffffff'];
  for (let i = 0; i < 46; i += 1) {
    const p = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 220;
    p.className = 'cf';
    p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % 5]};--dx:${Math.cos(angle) * speed}px;--dy:${Math.sin(angle) * speed - 80 + Math.random() * 260}px;--r:${Math.random() * 900}deg`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1250);
  }
}

/* ── Formatting ─────────────────────────────────────────────────────── */

export const inr = (paise) => `₹${Math.round(Number(paise || 0) / 100).toLocaleString('en-IN')}`;

export const inrPlain = (rupees) => `₹${Math.round(Number(rupees || 0)).toLocaleString('en-IN')}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function day(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function dayShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function monthShort(date) {
  return MONTHS[date.getMonth()];
}

export function tripRange(start, end) {
  if (!start && !end) return 'Dates to be confirmed';
  return `${day(start)} – ${day(end)}`;
}

export function relative(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/* ── Cars ───────────────────────────────────────────────────────────── */

export const CATEGORY_LABEL = {
  hatchback: 'Hatchback',
  sedan: 'Sedan',
  suv: 'SUV',
  luxury: 'Luxury',
  van: 'Van',
  bike: 'Bike',
};

export const CATEGORY_PAINT = {
  hatchback: '#c8362f',
  sedan: '#2f6fd0',
  suv: '#d98a2a',
  luxury: '#2c3a8c',
  van: '#8f7a5e',
  bike: '#1f8f6a',
};

/** Stable paint per car, so the same car keeps its colour across pages. */
export function paintFor(car) {
  const key = String(car?.category || '').toLowerCase();
  if (CATEGORY_PAINT[key]) return CATEGORY_PAINT[key];
  const palette = Object.values(CATEGORY_PAINT);
  const seed = String(car?.id || car?.model || 'car');
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n = (n + seed.charCodeAt(i)) % 997;
  return palette[n % palette.length];
}

export const uprightFor = (car) => ['suv', 'van'].includes(String(car?.category || '').toLowerCase());

export const carTitle = (car) => [car?.make || car?.brand, car?.model].filter(Boolean).join(' ') || 'Car';

/* Saved shortlist lives in the browser — the API has no favourites table. */
const SAVED_KEY = 'renter-saved-cars';

export function savedCars() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function toggleSaved(id) {
  const list = savedCars();
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  return next;
}

/* ── Theme ──────────────────────────────────────────────────────────── */

export function storedTheme() {
  return localStorage.getItem('renter-theme') || '';
}

export function applyTheme(mode) {
  if (mode) {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem('renter-theme', mode);
  }
}

export function isDark() {
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
