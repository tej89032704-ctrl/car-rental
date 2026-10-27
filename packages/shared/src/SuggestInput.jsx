import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/suggest.css';

/**
 * A text field that offers a list but never insists on it.
 *
 * The native <datalist> was the first attempt: it accepts free text, which is
 * required (a town missing from any list still has to be saveable), but it has
 * no affordance — nothing on screen says "there is a list here" — and its popup
 * is drawn by the OS in colours that ignore the portal's theme entirely.
 *
 * So: a real input, a chevron that opens the full list, the same list filtered
 * as you type, and any wording at all still accepted. Options may carry a hint
 * (a state name beside a city, say) which is shown greyed beside the label.
 */
export default function SuggestInput({
  id,
  value,
  onChange,
  onPick,
  onBlurValue,
  options = [],
  placeholder = '',
  ariaLabel = 'Choose an option',
  autoComplete = 'off',
  disabled = false,
  hintFor,
  emptyText = 'Nothing matches — keep typing to use your own wording.',
  className = '',
  inputClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Opened from the chevron shows the whole list; typing filters it. Without
  // this flag a field holding "Karnataka" would open showing only Karnataka.
  const [filtering, setFiltering] = useState(false);
  const [pos, setPos] = useState(null);
  // Last committed popup position, so the per-frame anchor check can skip
  // state updates when nothing moved.
  const lastPos = useRef(null);
  const input = useRef(null);
  const pop = useRef(null);
  const tog = useRef(null);
  // Set while the chevron focuses the field itself, so that focus does not
  // count as the user opening the list again: without it, clicking the chevron
  // to close would immediately reopen what it just closed.
  const selfFocus = useRef(false);

  const typed = value.trim().toLowerCase();
  const list = filtering && typed
    ? options.filter((o) => o.value.toLowerCase().includes(typed) || (o.hint || '').toLowerCase().includes(typed))
    : options;

  const measure = useCallback(() => {
    const el = input.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = Math.max(r.width, 240);
    const H = Math.min(288, Math.max(1, list.length) * 44 + 12);
    const GAP = 6;
    let left = r.left;
    if (left + W > window.innerWidth - 10) left = Math.max(10, window.innerWidth - W - 10);
    let top = r.bottom + GAP;
    if (top + H > window.innerHeight - 10) top = Math.max(10, r.top - H - GAP);
    const next = { left, top, width: W };
    const prev = lastPos.current;
    // Only commit when the field actually moved: this runs on every frame
    // while open, and re-rendering on each of them would be pure waste.
    if (
      prev
      && Math.abs(prev.left - next.left) < 0.5
      && Math.abs(prev.top - next.top) < 0.5
      && Math.abs(prev.width - next.width) < 0.5
    ) return;
    lastPos.current = next;
    setPos(next);
  }, [list.length]);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  // The popup is fixed-position, so anything that moves the field after it
  // opened -- a page scroll, an image loading, a results list appearing above
  // it -- leaves the list floating where the field used to be. Scroll and
  // resize listeners miss the layout shifts that are not either, so while the
  // list is open it is re-anchored to the field every frame.
  useEffect(() => {
    if (!open) return undefined;
    let raf = 0;
    const tick = () => {
      measure();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      // The chevron is part of the field, not an outside click. Without it here
      // this handler closes the list on mousedown and the button's own click
      // then reopens it, so the chevron could never close anything.
      if (
        pop.current?.contains(e.target)
        || input.current?.contains(e.target)
        || tog.current?.contains(e.target)
      ) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', measure);
    // Follow the field rather than closing, so scrolling to reach the field
    // does not dismiss the list the user just opened.
    window.addEventListener('scroll', measure, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (active >= list.length) setActive(-1);
  }, [list.length, active]);

  const host = typeof document === 'undefined' ? null : (input.current?.closest('.ce') || document.body);

  function choose(option) {
    onPick?.(option);
    onChange?.({ target: { value: option.value } });
    setOpen(false);
    setFiltering(false);
    input.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open) { setOpen(true); return; }
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => {
        const next = i + step;
        if (next < 0) return list.length - 1;
        if (next >= list.length) return 0;
        return next;
      });
      return;
    }
    if (e.key === 'Enter' && open && active >= 0 && list[active]) {
      e.preventDefault();
      choose(list[active]);
      return;
    }
    if (e.key === 'Tab') setOpen(false);
  }

  return (
    <>
      <span className={`sug ${className}`}>
        <input
          id={id}
          ref={input}
          className={inputClassName}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          onChange={(e) => {
            setFiltering(true);
            setOpen(true);
            onChange?.(e);
          }}
          onFocus={() => {
            if (selfFocus.current) { selfFocus.current = false; return; }
            setFiltering(false);
            setOpen(true);
          }}
          onBlur={() => { onBlurValue?.(value); }}
          onKeyDown={onKeyDown}
        />
        <button
          ref={tog}
          type="button"
          className="sug-tog"
          tabIndex={-1}
          aria-label={`Show ${ariaLabel} list`}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            // Some portals wrap their fields in a <label>, whose own click
            // behaviour focuses the input — which would open the list again on
            // the way out. Cancelling the default action keeps this button the
            // only thing deciding whether the list is shown.
            e.preventDefault();
            // From the chevron always show everything, even with text in the box.
            setFiltering(false);
            setActive(-1);
            setOpen((v) => !v);
            selfFocus.current = true;
            input.current?.focus({ preventScroll: true });
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </span>

      {open && host && createPortal(
        <div
          className="sug-pop"
          ref={pop}
          role="listbox"
          aria-label={ariaLabel}
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { left: 0, top: 0, visibility: 'hidden' }}
        >
          {list.length === 0 && <div className="sug-empty">{emptyText}</div>}
          {list.map((o, i) => (
            <button
              key={o.value + (o.hint || '')}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`sug-item${i === active ? ' on' : ''}${o.value === value ? ' sel' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              <span>{o.value}</span>
              <small>{o.hint || hintFor?.(o) || ''}</small>
            </button>
          ))}
        </div>,
        host,
      )}
    </>
  );
}
