import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A date field that matches the CAR-ENT artwork.
 *
 * The native <input type="date"> picker is drawn by the OS: a flat grey
 * Windows/Chrome calendar that ignores the portal's glass panels, Fraunces
 * headings and amber accent. It also cannot jump decades, which is the one
 * thing a birthday field needs.
 *
 * The popover is portalled to the `.ce` root rather than rendered in place:
 * the form sits inside `.panel`, which is `overflow:hidden` and carries a
 * `backdrop-filter` — together they clip a child popover and re-base any
 * `position:fixed` inside it. Portalling to `.ce` keeps the theme's custom
 * properties (they are declared on `.ce`, not `:root`) while escaping the clip.
 */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad = (n) => String(n).padStart(2, '0');

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

const toIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export default function DatePicker({
  id,
  value,
  onChange,
  max,
  minYear = 1900,
  placeholder = 'Select date',
  ariaLabel = 'Choose a date',
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);

  const selected = parseIso(value);
  const today = useMemo(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }, []);

  // With no value, open on a plausible birth year instead of this month --
  // otherwise picking a birthday starts 40 "previous month" clicks away.
  const [view, setView] = useState(() => ({
    y: selected?.y ?? today.y - 28,
    m: selected?.m ?? 0,
  }));

  useEffect(() => {
    if (selected) setView({ y: selected.y, m: selected.m });
    // Reacting to `value` alone keeps this from fighting the header nav.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const measure = useCallback(() => {
    if (!btn.current) return;
    const b = btn.current.getBoundingClientRect();
    const W = 316;
    const H = 392;
    const GAP = 10;
    let left = b.left;
    if (left + W > window.innerWidth - 10) left = Math.max(10, window.innerWidth - W - 10);
    let top = b.bottom + GAP;
    if (top + H > window.innerHeight - 10) top = Math.max(10, b.top - H - GAP);
    setPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (pop.current?.contains(e.target) || btn.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Follow the trigger instead of dismissing on scroll. Closing here would
    // also fire for the scroll a click itself can cause, so the popover shut
    // the instant it opened. Capture phase catches scrolling containers too.
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const cells = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const years = [];
  for (let y = today.y; y >= minYear; y -= 1) years.push(y);

  const label = selected ? `${selected.d} ${MONTHS_SHORT[selected.m]} ${selected.y}` : '';
  const host = typeof document === 'undefined' ? null : (btn.current?.closest('.ce') || document.body);

  function shift(step) {
    setView((v) => {
      const m = v.m + step;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  }

  function pick(day) {
    onChange(toIso(view.y, view.m, day));
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        id={id}
        ref={btn}
        className="dp-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={label ? undefined : 'ph'}>{label || placeholder}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>

      {open && host && createPortal(
        <div
          className="dp-pop"
          ref={pop}
          role="dialog"
          aria-label={ariaLabel}
          style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
        >
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
            <div className="dp-sel">
              <select
                aria-label="Month"
                value={view.m}
                onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}
              >
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select
                aria-label="Year"
                value={view.y}
                onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" className="dp-nav" aria-label="Next month" onClick={() => shift(1)}>›</button>
          </div>

          <div className="dp-week" aria-hidden="true">
            {WEEK.map((w, i) => <span key={`${w}-${i}`}>{w}</span>)}
          </div>

          <div className="dp-grid" role="grid">
            {cells.map((day, i) => {
              if (day === null) return <span key={`b-${i}`} />;
              const dayIso = toIso(view.y, view.m, day);
              const isFuture = !!max && dayIso > max;
              const isOn = !!selected && selected.y === view.y && selected.m === view.m && selected.d === day;
              const isToday = today.y === view.y && today.m === view.m && today.d === day;
              return (
                <button
                  key={dayIso}
                  type="button"
                  className={`dp-d${isOn ? ' on' : ''}${isToday ? ' today' : ''}`}
                  disabled={isFuture}
                  aria-pressed={isOn}
                  aria-label={`${day} ${MONTHS[view.m]} ${view.y}`}
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="dp-foot">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setView({ y: today.y, m: today.m });
                onChange(toIso(today.y, today.m, today.d));
                setOpen(false);
              }}
              disabled={!!max && toIso(today.y, today.m, today.d) > max}
            >
              Today
            </button>
          </div>
        </div>,
        host,
      )}
    </>
  );
}
