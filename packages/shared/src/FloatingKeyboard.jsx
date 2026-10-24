import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * FloatingKeyboard — Apple-style floating software keyboard for auth forms.
 *
 * Appears when an input inside `.auth-shell` is focused, so it can never leak
 * into the logged-in app. Mounted once per portal, outside <App/>, which keeps
 * `position: fixed` viewport-relative (auth wrappers animate `transform`, and a
 * transformed ancestor would otherwise re-anchor fixed children to itself).
 */

const ALPHA = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const NUM = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
];

const NUMPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

const ChevDown = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
       strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const ShiftIcon = ({ on }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill={on ? 'currentColor' : 'none'}
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l8 8h-5v8H9v-8H4l8-8z" />
  </svg>
);

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 5H8l-6 7 6 7h13a1 1 0 001-1V6a1 1 0 00-1-1z" />
    <path d="M17 9l-5 6M12 9l5 6" />
  </svg>
);

/* Write through the native value setter + a bubbling `input` event so React's
   controlled inputs (value={...} onChange={...}) pick the edit up. Setting
   `el.value` directly is invisible to React and the keystroke would vanish. */
function editValue(el, compute) {
  if (!el) return;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return;

  let start;
  let end;
  try { start = el.selectionStart; end = el.selectionEnd; } catch { /* unsupported type */ }
  if (start == null) { start = el.value.length; end = start; }

  const { value, caret } = compute(el.value, start, end);
  let next = value;
  if (typeof el.maxLength === 'number' && el.maxLength >= 0 && next.length > el.maxLength) {
    next = next.slice(0, el.maxLength);
  }

  setter.call(el, next);
  const at = Math.min(caret, next.length);
  try { el.setSelectionRange(at, at); } catch { /* unsupported type */ }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const insert = (el, ch) =>
  editValue(el, (v, s, e) => ({ value: v.slice(0, s) + ch + v.slice(e), caret: s + ch.length }));

const backspace = (el) =>
  editValue(el, (v, s, e) => {
    if (s !== e) return { value: v.slice(0, s) + v.slice(e), caret: s };
    if (s === 0) return { value: v, caret: 0 };
    return { value: v.slice(0, s - 1) + v.slice(s), caret: s - 1 };
  });

/* Auth routes across all four portals. The DOM check below is the precise
   signal, but the agent portal still renders `.auth-box card` instead of
   `.auth-shell`, so the route is the fallback. `.auth-box card` alone is NOT
   a safe signal — renter's MyBookings/BookingDetail reuse that class logged-in. */
const AUTH_PATHS = [
  '/login', '/signup', '/verify-otp', '/forgot-password', '/reset-password', '/agent/login',
];

/* Cards lifted to clear the pad. Module scope so both the focus effect and
   the unmount cleanup can reset them. */
const clearLifts = (except) => {
  document.querySelectorAll('[data-fk-lift]').forEach((c) => {
    if (c === except) return;
    c.style.top = '';
    c.removeAttribute('data-fk-lift');
  });
};

export default function FloatingKeyboard() {
  const [target, setTarget] = useState(null);
  const [layout, setLayout] = useState('abc'); // 'abc' | 'num' | 'numpad'
  const [shift, setShift] = useState(false);
  const [pos, setPos] = useState(null);        // dragged top-left, px
  const [down, setDown] = useState(null);      // data-k of the key under the pointer
  const boxRef = useRef(null);
  const dragRef = useRef(null);
  const location = useLocation();

  /* ── show / hide ── */
  useEffect(() => {
    const onFocusIn = (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (el.disabled || el.readOnly) return;
      const onAuth = el.closest('.auth-shell') || AUTH_PATHS.includes(window.location.pathname);
      if (!onAuth) { setTarget(null); setPos(null); return; }
      setTarget(el);
      setShift(false);
      const numeric = el.inputMode === 'numeric' || el.inputMode === 'tel' || el.type === 'tel';
      setLayout(numeric ? 'numpad' : 'abc');
    };

    const onFocusOut = () => {
      // Defer so we can see where focus actually landed (a key press keeps
      // focus in the input by cancelling its own mousedown).
      window.setTimeout(() => {
        const a = document.activeElement;
        if (a && (a.closest?.('.fk') || a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement)) return;
        // Hidden for good — drop any drag offset so the next open starts docked.
        setTarget(null);
        setPos(null);
      }, 0);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  /* ── navigation closes it ── */
  useEffect(() => { setTarget(null); setPos(null); }, [location.pathname]);

  /* ── keep the form clear of the pad ────────────────────────────
     `.auth-shell` clips (overflow:hidden) and its page won't scroll,
     so on short viewports the docked pad would cover the password
     field. Lift the card until the whole card clears the pad: fields,
     submit button, and the footer that lives below the form
     ("Forgot password?", "Create an account", the portals note).
     Measuring only the last field + the button left those footer links
     buried under the pad, so the card's own bottom edge is a target too.
     The lift stops at the card's top, so with no headroom the fields
     still win and Return dismisses the pad first (the normal
     on-screen-keyboard pattern).
     `top` is safe: authFadeIn only animates opacity/transform. */
  useEffect(() => {
    if (!target) { clearLifts(); return undefined; }

    // Synchronous on purpose: refs are attached before effects run, and
    // requestAnimationFrame never fires while the tab is hidden.
    const kb = boxRef.current;
    const card = target.isConnected
      ? target.closest('.auth-wrap, .auth-card-center, .admin-login-card, .auth-box, .vfy-edge')
      : null;
    if (!kb || !card) { clearLifts(); return undefined; }
    clearLifts(card);

    // Measure from the unlifted position — otherwise a field switch would
    // read its own lift as "already clear" and settle back to zero.
    if (card.hasAttribute('data-fk-lift')) {
      card.style.top = '';
      card.removeAttribute('data-fk-lift');
    }

    const form = target.closest('form');
    const fields = form
      ? [...form.querySelectorAll('input, textarea')].filter((el) => !el.disabled && el.type !== 'hidden')
      : [target];
    const last = fields[fields.length - 1] || target;
    const submit = form
      ? [...form.querySelectorAll('[type="submit"], .btn, button')].pop() || null
      : null;

    // Docked box, ignoring the entrance transform (offset* and computed
    // styles are layout values, so they are unaffected by it).
    const cs = getComputedStyle(kb);
    const kbH = kb.offsetHeight;
    // Two dockings (see floating-keyboard.css): bottom-anchored below the
    // width threshold, mid-height (top:50% + translateY(-50%)) above it.
    // Detect which via --fk-shift: it's a custom property, so getComputedStyle
    // returns the cascaded token ("-50%" / "0px") verbatim. `top`/`bottom`
    // can't be used for this — Chrome reports the *used* length, so an
    // element specified `bottom: auto` still comes back as "151px", which
    // would have mistaken a centred pad for a bottom-docked one and put
    // kbTop half a pad-height too low.
    const centred = cs.getPropertyValue('--fk-shift').trim() !== '0px';
    // clientWidth/clientHeight, not inner*: a fixed element is positioned
    // against the initial containing block, which excludes scrollbars —
    // innerWidth over-counts them and shifted kbLeft by 15px on any page
    // long enough to scroll.
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const kbTop = pos
      ? pos.y
      : centred
        ? (vh - kbH) / 2
        : vh - (parseFloat(cs.bottom) || 0) - kbH;
    const kbRight = pos ? pos.x + kb.offsetWidth : vw - (parseFloat(cs.right) || 0);
    const kbLeft = kbRight - kb.offsetWidth;

    // The pad is docked right, so on a wide screen it may not reach the form
    // at all — only lift when it actually crosses that element.
    const needOf = (el) => {
      const r = el.getBoundingClientRect();
      if (!(kbRight > r.left && kbLeft < r.right)) return Number.NEGATIVE_INFINITY;
      return Math.ceil(r.bottom + 12 - kbTop);
    };

    // Lifting past the card's own top would let the shell clip it.
    const limit = Math.max(0, card.getBoundingClientRect().top - 8);
    // Bottom-docked, the pad sits *under* the card, so the card's own bottom
    // edge is a fair target — lift until it clears and nothing inside (the
    // footer links included) is buried. Centred, the pad lies alongside the
    // card and the only edge it crosses is the card's right margin, which
    // lifting cannot move: targeting that would pin the card to the top of
    // the shell even with every field already clear (at 1920px the fields
    // stop short of the pad by ~40px, but the card overhangs it by ~44px).
    // So in that mode track the links themselves instead of the edge.
    const edgeTargets = centred ? [...card.querySelectorAll('a')] : [card];
    let lift = Math.max(needOf(last), ...edgeTargets.map(needOf));
    if (submit) {
      const forSubmit = needOf(submit);
      if (forSubmit > 4 && forSubmit > lift) lift = forSubmit;
    }
    lift = Math.min(lift, limit);
    if (!Number.isFinite(lift) || lift <= 0) return undefined;

    card.setAttribute('data-fk-lift', '');
    card.style.top = `-${lift}px`;
    return undefined;
  }, [target, pos, layout]);

  /* ── unmount leaves nothing behind ── */
  useEffect(() => () => clearLifts(), []);

  /* ── typing ── */
  const type = (ch) => {
    if (!target) return;
    insert(target, shift && layout === 'abc' ? ch.toUpperCase() : ch);
    if (shift) setShift(false);
    target.focus?.();
  };

  const del = () => { if (!target) return; backspace(target); target.focus?.(); };

  const dismiss = () => { const t = target; setTarget(null); setPos(null); t?.blur(); };

  /* ── drag ── */
  const onDragStart = (e) => {
    // Only a primary-button drag; ignore right/middle clicks.
    if (e.button != null && e.button !== 0) return;
    // The dismiss chevron sits in this bar. Capturing the pointer here would
    // retarget the follow-up mouseup/click to the bar, so the button would
    // never see its own click and the pad could only be dismissed by
    // clicking a field elsewhere.
    if (e.target.closest?.('.fk-hide')) return;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, w: rect.width, h: rect.height };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.min(Math.max(e.clientX - d.dx, 8), Math.max(8, window.innerWidth - d.w - 8));
    const y = Math.min(Math.max(e.clientY - d.dy, 8), Math.max(8, window.innerHeight - d.h - 8));
    setPos({ x, y });
  };
  const onDragEnd = (e) => {
    dragRef.current = null;
    // Guarded: releasing an unheld pointer is a no-op, but never throw.
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* not captured */ }
  };

  if (!target) return null;

  const isEmail = target.type === 'email';
  const fieldLabel =
    target.type === 'password' ? 'Password'
      : target.type === 'email' ? 'Email'
        : (target.name || target.placeholder || 'Text');

  // Docked against the right edge and centred vertically (see CSS), so no
  // inline transform — an inline transform would be stomped by the entrance
  // keyframes. Dragging pins left/top, releases the anchors, and drops the
  // centring translate so the pad lands exactly where it was dropped.
  const style = pos
    ? { left: pos.x, right: 'auto', top: pos.y, bottom: 'auto', transform: 'none' }
    : null;

  // Keys never take focus away from the field being typed into.
  const keep = (e) => e.preventDefault();
  const hit = (e) => e.target.closest?.('[data-k]')?.dataset.k ?? null;

  const key = (ch, extra = '') => (
    <button key={ch} type="button" tabIndex={-1} data-k={ch}
      className={`fk-key ${extra} ${down === ch ? 'fk-down' : ''}`}
      onMouseDown={keep} onClick={() => type(ch)}>
      {shift && layout === 'abc' ? ch.toUpperCase() : ch}
    </button>
  );

  const mod = (label, onClick, extra = '', node = null) => (
    <button key={label} type="button" tabIndex={-1} data-k={label}
      className={`fk-key fk-mod ${extra} ${down === label ? 'fk-down' : ''}`}
      onMouseDown={keep} onClick={onClick} aria-label={label}>
      {node || label}
    </button>
  );

  let rows;

  if (layout === 'numpad') {
    rows = (
      <>
        {NUMPAD.map((row, i) => (
          <div className="fk-row" key={i}>{row.map((c) => key(c, 'fk-num'))}</div>
        ))}
        <div className="fk-row">
          {mod('Backspace', del, 'fk-col', <BackIcon />)}
          {key('0', 'fk-num')}
          {mod('Return', dismiss, 'fk-return fk-col')}
        </div>
      </>
    );
  } else if (layout === 'num') {
    rows = (
      <>
        <div className="fk-row">{NUM[0].map((c) => key(c))}</div>
        <div className="fk-row">{NUM[1].map((c) => key(c))}</div>
        <div className="fk-row">
          {mod('ABC', () => setLayout('abc'))}
          {['.', ',', '?', '!', "'"].map((c) => key(c))}
          {mod('Backspace', del, '', <BackIcon />)}
        </div>
        <div className="fk-row">
          <button type="button" tabIndex={-1} data-k="space"
            className={`fk-key fk-space ${down === 'space' ? 'fk-down' : ''}`}
            onMouseDown={keep} onClick={() => type(' ')}>space</button>
          {mod('Return', dismiss, 'fk-return')}
        </div>
      </>
    );
  } else {
    rows = (
      <>
        <div className="fk-row">{ALPHA[0].map((c) => key(c))}</div>
        <div className="fk-row fk-row--stagger">{ALPHA[1].map((c) => key(c))}</div>
        <div className="fk-row">
          {mod('Shift', () => setShift((s) => !s), shift ? 'fk-on' : '', <ShiftIcon on={shift} />)}
          {ALPHA[2].map((c) => key(c))}
          {mod('Backspace', del, '', <BackIcon />)}
        </div>
        <div className="fk-row">
          {mod('Numbers', () => setLayout('num'))}
          {isEmail && key('@')}
          {isEmail && key('.')}
          <button type="button" tabIndex={-1} data-k="space"
            className={`fk-key fk-space ${down === 'space' ? 'fk-down' : ''}`}
            onMouseDown={keep} onClick={() => type(' ')}>space</button>
          {mod('Return', dismiss, 'fk-return')}
        </div>
      </>
    );
  }

  return (
    <div className={`fk${layout === 'numpad' ? ' fk-numpad' : ''}`} ref={boxRef} style={style}
      role="group" aria-label="On-screen keyboard"
      onPointerDown={(e) => setDown(hit(e))}
      onPointerOver={(e) => { if (e.buttons) setDown(hit(e)); }}
      onPointerUp={() => setDown(null)}
      onPointerLeave={() => setDown(null)}
      onPointerCancel={() => setDown(null)}>
      <div className="fk-top" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd} onLostPointerCapture={onDragEnd} title="Drag to move">
        <span className="fk-field">{fieldLabel}</span>
        <span className="fk-handle" />
        <button type="button" tabIndex={-1} className="fk-hide" onMouseDown={keep}
          onClick={dismiss} aria-label="Hide keyboard">
          <ChevDown />
        </button>
      </div>
      {rows}
    </div>
  );
}
