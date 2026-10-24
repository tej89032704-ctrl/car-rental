import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { applyTheme, storedTheme } from './ui.js';

/**
 * The portal chrome from the supplied artwork: wordmark, eight tabs, the
 * account chip, the ambient glass background and the progress hairline.
 *
 * Tabs are routes rather than hash pages so deep links, refresh and the
 * back button all keep working; the look and the order are the artwork's.
 */
const TABS = [
  { to: '/', label: 'Find a car', end: true },
  { to: '/enquiries', label: 'Enquiries & quotes' },
  { to: '/bookings', label: 'My bookings' },
  { to: '/reviews', label: 'My reviews' },
  { to: '/kyc', label: 'Verification' },
  { to: '/notifications', label: 'Notifications', badge: true },
  { to: '/lifetime', label: 'Lifetime' },
  { to: '/profile', label: 'Profile' },
];

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export default function PortalChrome({ guest = false }) {
  const location = useLocation();
  const [user, setUser] = useState(readUser);
  const [unread, setUnread] = useState(0);
  const glowRef = useRef(null);
  const topRef = useRef(null);

  useEffect(() => {
    if (guest) return undefined;
    const t = setInterval(() => setUser(readUser()), 1500);
    return () => clearInterval(t);
  }, [guest]);

  /* Restore the saved appearance once, before the first paint of the design. */
  useEffect(() => {
    const saved = storedTheme();
    if (saved) applyTheme(saved);
  }, []);

  /* The sticky search bar sits directly under the header, whose height changes
     when the tabs wrap out of the bar on a phone. Measure it rather than
     guessing a breakpoint constant. */
  useEffect(() => {
    const header = topRef.current;
    const root = header?.closest('.ce');
    if (!header || !root) return undefined;
    const sync = () => root.style.setProperty('--top-h', `${header.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  /* Unread badge. Best effort: a rented account with KYC still pending is
     refused this endpoint, and a missing badge is better than an error banner. */
  useEffect(() => {
    if (guest) return undefined;
    let live = true;
    const load = () => api('/notifications/mine')
      .then((rows) => {
        if (!live) return;
        setUnread((Array.isArray(rows) ? rows : []).filter((n) => !n.read_at).length);
      })
      .catch(() => {});
    load();
    window.addEventListener('ce:notifications', load);
    const t = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener('ce:notifications', load);
    };
  }, [guest, location.pathname]);

  /* Presentation effects from the artwork, delegated once for every page. */
  useEffect(() => {
    const root = document.documentElement;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const onMove = (e) => {
      const card = e.target.closest?.('.card');
      if (card && !reduce) {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        card.style.setProperty('--mx', `${x}px`);
        card.style.setProperty('--my', `${y}px`);
        card.style.transform = `perspective(900px) rotateX(${(0.5 - y / r.height) * 6}deg) rotateY(${(x / r.width - 0.5) * 8}deg) translateY(-6px)`;
      }
      const btn = e.target.closest?.('.go, .gh');
      if (btn) {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        btn.style.setProperty('--bx', `${x}px`);
        btn.style.setProperty('--by', `${y}px`);
        if (!reduce) {
          btn.style.transform = `translate(${(x - r.width / 2) * 0.12}px, ${(y - r.height / 2) * 0.22 - 2}px)`;
        }
      }
    };

    const onOut = (e) => {
      const card = e.target.closest?.('.card');
      if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
      const btn = e.target.closest?.('.go, .gh');
      if (btn && !btn.contains(e.relatedTarget)) btn.style.transform = '';
    };

    const onClick = (e) => {
      const b = e.target.closest?.('.go, .gh, .sw2, .fb button.t');
      if (!b || reduce) return;
      const r = b.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2;
      const span = document.createElement('span');
      span.className = 'rp';
      span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      b.appendChild(span);
      setTimeout(() => span.remove(), 700);
    };

    const onScroll = () => {
      const h = root.scrollHeight - window.innerHeight;
      const bar = document.getElementById('ce-pgbar');
      if (bar) bar.style.width = `${h > 0 ? (window.scrollY / h) * 100 : 0}%`;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* Pointer light, eased towards the cursor like the artwork's glow. */
    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = 300;
    let cx = tx;
    let cy = ty;
    const track = (e) => { tx = e.clientX; ty = e.clientY; };
    if (!reduce) {
      window.addEventListener('pointermove', track);
      const loop = () => {
        cx += (tx - cx) * 0.12;
        cy += (ty - cy) * 0.12;
        if (glowRef.current) glowRef.current.style.transform = `translate(${cx}px, ${cy}px)`;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', track);
      cancelAnimationFrame(raf);
    };
  }, []);

  const initial = (user?.name || 'R').trim().charAt(0).toUpperCase();

  return (
    <>
      <div className="ce-bg" aria-hidden="true"><i /><i /></div>
      <div className="ce-cg" ref={glowRef} aria-hidden="true" />
      <div className="ce-pgbar" id="ce-pgbar" aria-hidden="true" />

      <header className="top" ref={topRef}>
        <Link className="lg" to="/" aria-label="CAR-ENT home">CAR<i>·</i>ENT</Link>

        {guest ? (
          <nav className="tabs guest-tabs" aria-label="Account">
            <Link to="/">Browse cars</Link>
            <Link to="/terms">Terms</Link>
          </nav>
        ) : (
          <nav className="tabs" id="tabs" aria-label="Portal">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) => (isActive ? 'on' : '')}
              >
                {t.label}
                {t.badge && unread > 0 ? <b>{unread > 9 ? '9+' : unread}</b> : null}
              </NavLink>
            ))}
          </nav>
        )}

        {guest ? (
          <div className="me">
            <Link className="gh" to="/login">Log in</Link>
            <Link className="go" to="/signup" style={{ margin: 0, padding: '9px 20px', borderRadius: 99 }}>Sign up</Link>
          </div>
        ) : (
          <Link className="me" to="/profile" title="Your profile">
            <em>{user?.name || 'You'}</em>
            <span>{initial}</span>
          </Link>
        )}
      </header>

      <div className="ts" id="ce-toast" role="status" aria-live="polite" />
    </>
  );
}
