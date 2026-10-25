import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* ------------------------------- icons ---------------------------------- *
 * The reference keeps one path per nav entry in a single IC map and draws
 * them at 20px inside the rail. Ported as-is so the silhouettes match.      */
export const ICONS = {
  cars: 'M4 17h16M3 13l2-6h14l2 6v4H3zM7 17v2M17 17v2',
  reqs: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4',
  cal: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  revs: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  earn: 'M3 7h18v12H3zM3 7l3-3h12M16 13h2',
  mem: 'M3 8h18v11H3zM3 8l2-3h14l2 3M7 14h4',
  ver: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  not: 'M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21h4',
  prof: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-5 15-5 16 0',
  search: 'M20 20l-4-4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  sun: 'M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  bell: 'M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21h4',
  close: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

export function Icon({ name, size = 20, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={ICONS[name] || ICONS.cars} />
      {name === 'search' && <circle cx="11" cy="11" r="7" />}
    </svg>
  );
}

/* ------------------------------- toasts --------------------------------- */
const ToastCtx = createContext(() => {});
let toastSeq = 0;

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastHost({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message) => {
    const id = ++toastSeq;
    setItems((prev) => [...prev, { id, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4100);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div id="toasts" aria-live="polite">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            <span className="dot" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------ overlays -------------------------------- *
 * The source opened drawers/modals by swapping one persistent sheet's inner
 * HTML. We keep a single host and let the owner pick the content, so an
 * approve inside a drawer re-renders against live data instead of a snapshot. */
const OverlayCtx = createContext({ open: () => {}, close: () => {} });

export const useOverlay = () => useContext(OverlayCtx);

export function OverlayHost({ overlay, setOverlay, render, children }) {
  const open = useCallback((type, payload) => setOverlay({ type, payload }), [setOverlay]);
  const close = useCallback(() => setOverlay(null), [setOverlay]);
  const ctx = useMemo(() => ({ open, close }), [open, close]);

  useEffect(() => {
    if (!overlay) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [overlay, close]);

  const kind = overlay ? overlay.type : '';
  const sheetKind = kind === 'palette' ? 'pal' : kind === 'addCar' || kind === 'withdraw' ? 'modal' : 'drawer';

  return (
    <OverlayCtx.Provider value={ctx}>
      {/* The panel has to live inside this provider: sections call
          useOverlay().open() to raise a drawer, and outside it they get the
          inert default, so every card click and header button goes quiet.
          The sheet stays a sibling of .oh, which is what keeps the toast rail
          (z70) below it (z80) instead of trapped in the panel's context. */}
      {children}
      <div
        className={`mdl ${overlay ? 'on' : ''}`}
        onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        aria-hidden={!overlay}
      >
        <div className={`sheet ${sheetKind}`} role="dialog" aria-modal="true">
          {overlay ? render(overlay) : null}
        </div>
      </div>
    </OverlayCtx.Provider>
  );
}

/* --------------------------- car-build loader ---------------------------- *
 * The signature page transition: a red wireframe car assembles itself while
 * a progress bar fills and the stage captions step through. Reproduced from
 * the source, including the 2s percentage counter driven by @property --pc.  */
const BUILD_BODY =
  'M106 128L166 107L224 102L332 117L356 160L432 172L466 190L470 228L338 240L250 250L170 262L98 240L96 190L100 150Z';

const buildSpokes = (r) =>
  [0, 72, 144, 216, 288]
    .map((a) => `<path d="M0 0L${(r * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(r * Math.sin((a * Math.PI) / 180)).toFixed(1)}" stroke="#3b4147" stroke-width="5" stroke-linecap="round"/>`)
    .join('');

const buildWheel = (x, y, rx, ry, qx, qy, d) =>
  `<g transform="translate(${x} ${y})">` +
  `<ellipse class="fd" style="--d:${d}s" rx="${rx}" ry="${ry}" fill="#101214"/>` +
  `<ellipse class="dr" style="--d:.3s" rx="${rx}" ry="${ry}"/>` +
  `<ellipse class="fd" style="--d:1s" rx="${qx}" ry="${qy}" fill="url(#cbr)"/>` +
  `<g transform="scale(${(qx / qy).toFixed(2)} 1)"><g class="fd" style="--d:1s"><g>` +
  `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur=".7s" begin="1.2s" repeatCount="indefinite"/>` +
  `${buildSpokes(qy * 0.8)}</g><circle r="5" fill="#2a2f34"/></g></g></g>`;

const BUILD_SLOTS = [...Array(7)]
  .map((_, i) => `<rect x="${397 + i * 8}" y="185" width="4.6" height="31" rx="2" fill="#f4f4f4"/>`)
  .join('');

const BUILD_SVG =
  `<svg class="cb" viewBox="60 84 460 262" aria-hidden="true">` +
  `<defs>` +
  `<linearGradient id="cbp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6672"/><stop offset=".5" stop-color="#e0182d"/><stop offset="1" stop-color="#8a0d1e"/></linearGradient>` +
  `<linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c7b86"/><stop offset=".6" stop-color="#12181d"/><stop offset="1" stop-color="#34414b"/></linearGradient>` +
  `<radialGradient id="cbr"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".7" stop-color="#b9c0c6"/><stop offset="1" stop-color="#7d858c"/></radialGradient>` +
  `<linearGradient id="cbs" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
  `<radialGradient id="cbl"><stop offset="0" stop-color="#fff6c9" stop-opacity=".95"/><stop offset="1" stop-color="#fff6c9" stop-opacity="0"/></radialGradient>` +
  `<pattern id="cbq" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="currentColor" stroke-width=".6"/></pattern>` +
  `<clipPath id="cbc"><path d="${BUILD_BODY}"/></clipPath>` +
  `</defs>` +
  `<rect class="g" x="60" y="84" width="460" height="262" fill="url(#cbq)"/>` +
  `<path class="rk" d="M64 330L96 312L130 298L170 292L214 300L262 318L318 318L356 296L404 296L452 292L492 300L516 326V346H64Z" fill="#161a1d"/>` +
  `<path class="fd" style="--d:.95s" d="${BUILD_BODY}" fill="url(#cbp)"/>` +
  `<path class="dr" style="--d:.15s;animation-duration:.9s" d="${BUILD_BODY}"/>` +
  `<path class="fd" style="--d:1s" d="M240 238C246 204 288 186 326 192C356 198 372 218 374 244L352 242C350 224 336 212 318 210C292 208 270 218 262 242Z" fill="#7a0b1a"/>` +
  `<path class="fd" style="--d:1s" d="M94 238C94 214 110 200 132 198C152 198 164 212 166 238L150 238C148 222 140 214 130 214C118 214 112 222 112 238Z" fill="#7a0b1a"/>` +
  `<g class="drp" style="--d:1.15s">` +
  `<path d="M224 106L330 119L352 158L234 154Z" fill="url(#cbg)"/>` +
  `<path d="M170 120L212 114L220 156L172 162Z" fill="url(#cbg)"/>` +
  `<path d="M110 130L158 120L158 168L108 174Z" fill="url(#cbg)"/>` +
  `<path d="M240 112L300 122L250 150Z" fill="#fff" opacity=".1"/></g>` +
  `<path class="dr wl" style="--d:1.05s;animation-duration:.5s" d="M166 166L214 158L222 232L168 246Z M200 172H210 M236 158L356 163L430 175"/>` +
  `<rect class="fd" style="--d:1.2s" x="184" y="146" width="16" height="12" rx="3" fill="#121416"/>` +
  `${buildWheel(130, 262, 29, 37, 17, 22, 0.6)}${buildWheel(300, 278, 50, 57, 31, 36, 0.5)}` +
  `<g class="fd" style="--d:1.3s"><path d="M392 180L452 184L456 220L394 218Z" fill="#121416"/>${BUILD_SLOTS}</g>` +
  `<g class="fd" style="--d:1.6s"><ellipse cx="378" cy="192" rx="12" ry="15" fill="#f6f6f6" stroke="#121416" stroke-width="3"/><ellipse cx="456" cy="190" rx="7" ry="9" fill="#f6f6f6" stroke="#121416" stroke-width="2"/></g>` +
  `<circle class="fd gl" cx="378" cy="192" r="36" fill="url(#cbl)"/>` +
  `<g class="sl"><path d="M336 238L498 228L503 248L350 264Z" fill="#eef1f3" stroke="#121416" stroke-width="2"/>` +
  `<path d="M350 252L500 240" stroke="#121416" stroke-width="3"/><circle cx="438" cy="248" r="6" fill="#121416"/><circle cx="470" cy="244" r="5" fill="#121416"/></g>` +
  `<g clip-path="url(#cbc)"><g class="shn"><rect x="40" y="90" width="46" height="260" fill="url(#cbs)" transform="skewX(-20)"/></g></g>` +
  `</svg>`;

export function CarBuildLoader({ title, skeletons = 'list' }) {
  return (
    <div className="ld">
      <div className="lw">
        <span dangerouslySetInnerHTML={{ __html: BUILD_SVG }} />
        <div className="tk"><s /></div>
        <div className="lr">
          <span className="stg">
            <span style={{ '--d': '0s' }}>Laying the frame</span>
            <span style={{ '--d': '.4s' }}>Mounting the wheels</span>
            <span style={{ '--d': '.8s' }}>Shaping the body</span>
            <span style={{ '--d': '1.3s' }}>Fitting glass and lights</span>
            <span style={{ '--d': '1.75s' }}>{title} ready</span>
          </span>
          <span className="pct" />
        </div>
      </div>
      {skeletons === 'grid'
        ? <div className="gr"><div className="sk" style={{ height: 250 }} /><div className="sk" style={{ height: 250 }} /><div className="sk" style={{ height: 250 }} /></div>
        : <><div className="sk" /><div className="sk" /><div className="sk" style={{ width: '72%' }} /></>}
    </div>
  );
}

/* Top progress bar fired on every section change. */
export function useTopProgress(dep) {
  useEffect(() => {
    const el = document.getElementById('pb');
    if (!el) return undefined;
    el.style.transition = 'none';
    el.style.width = '0';
    el.style.opacity = '1';
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.style.transition = 'width .5s ease-out';
        el.style.width = '100%';
        setTimeout(() => { el.style.opacity = '0'; }, 560);
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [dep]);
  return null;
}
