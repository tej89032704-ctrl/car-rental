import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A single-choice field drawn in the portal's own language.
 *
 * The native <select> hands its open list to the OS, which paints the flat
 * blue system menu seen nowhere else in the artwork, and it cannot show a
 * symbol beside each option. This picker shows the chosen option as
 * "glyph + name" on the field and lists the full set the same way.
 *
 * Like DatePicker it portals its popover to `.ce`: the form lives inside
 * `.panel`, which is `overflow:hidden` with a `backdrop-filter`, so an inline
 * popover would be clipped and its fixed positioning re-based onto the card.
 * `.ce` is also where the theme custom properties are declared.
 */
export default function OptionPicker({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  ariaLabel = 'Choose an option',
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);

  const selected = options.find((o) => o.value === value) || null;

  const measure = useCallback(() => {
    if (!btn.current) return;
    const b = btn.current.getBoundingClientRect();
    const W = 268;
    const H = Math.min(320, options.length * 44 + 24);
    const GAP = 8;
    let left = b.left;
    if (left + W > window.innerWidth - 10) left = Math.max(10, window.innerWidth - W - 10);
    let top = b.bottom + GAP;
    if (top + H > window.innerHeight - 10) top = Math.max(10, b.top - H - GAP);
    setPos({ left, top, width: Math.max(W, Math.round(b.width)) });
  }, [options.length]);

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
    // Follow the field rather than dismissing: closing here would also fire
    // for the scroll a click itself can cause.
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  const host = typeof document === 'undefined' ? null : (btn.current?.closest('.ce') || document.body);

  function choose(next) {
    onChange(next);
    setOpen(false);
    btn.current?.focus();
  }

  return (
    <>
      <button
        type="button"
        id={id}
        ref={btn}
        className="op-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? (
          <>
            <i className="op-sym" aria-hidden="true">{selected.symbol}</i>
            <span className="op-lbl">{selected.label}</span>
          </>
        ) : (
          <span className="ph">{placeholder}</span>
        )}
        <svg className="op-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && host && createPortal(
        <div
          className="op-pop"
          ref={pop}
          role="listbox"
          aria-label={ariaLabel}
          style={pos
            ? { left: pos.left, top: pos.top, minWidth: pos.width }
            : { left: 0, top: 0, visibility: 'hidden' }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`op-item${o.value === value ? ' on' : ''}`}
              onClick={() => choose(o.value)}
            >
              <i className="op-sym" aria-hidden="true">{o.symbol}</i>
              <span className="op-lbl">{o.label}</span>
              {o.value === value && (
                <svg className="op-tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 13 4 4 10-10" />
                </svg>
              )}
            </button>
          ))}
        </div>,
        host,
      )}
    </>
  );
}
