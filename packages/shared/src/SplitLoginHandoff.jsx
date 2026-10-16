import { useEffect, useRef, useState } from 'react';

/**
 * Sends the visitor on to the premium split login document.
 *
 * `public/login-split.html` in the customer and owner apps is a standalone
 * page: its own typography, its own canvas scenes, and its own fetch to
 * /api/auth/login that writes the access_token / refresh_token / user keys
 * packages/shared/src/api.js reads back. Each portal serves it at /login with
 * a small Vite plugin, so a real navigation to /login never reaches React.
 *
 * An in-app link does reach React — `<Link to="/login">` and the logout button
 * are client-side pushes that never touch the server — so the /login route
 * renders this instead of an auth card, and hands the visitor over.
 *
 * The handoff keeps state because a host may be missing the /login rewrite
 * (nothing in this repo configures production hosting). If our own handoff
 * comes back to the app, that is the proof, and the next attempt goes to
 * login-split.html directly — a plain public asset that exists on any host.
 * After MAX_HANDOFFS attempts it stops and renders `fallback`, so the route
 * always ends somewhere usable rather than reloading forever.
 */
const BOUNCE_MS = 5000;
const MAX_HANDOFFS = 3;

function readHandoff(key) {
  try {
    const [at, tries] = String(sessionStorage.getItem(key) || '').split(':');
    return { at: Number(at) || 0, tries: Number(tries) || 0 };
  } catch {
    return { at: 0, tries: 0 };
  }
}

function writeHandoff(key, at, tries) {
  try {
    sessionStorage.setItem(key, `${at}:${tries}`);
  } catch {
    /* Storage denied (private mode, blocked cookies): every attempt then looks
       like a first attempt, so the count alone cannot stop a host whose /login
       never reaches the document. The bounce is what covers that case — the
       rewrite in vite.config.js either serves the document at /login or lets
       the app boot, and the app then goes to the file itself. */
  }
}

/**
 * @param {object} props
 * @param {string} props.storageKey  Per portal, so two portals sharing an
 *   origin's storage (they are separate origins today, but the keys also keep
 *   the handoff readable in devtools) never see each other's attempt count.
 * @param {React.ReactNode} [props.fallback]  Rendered only after every handoff
 *   attempt has failed, so the route is never a blank page.
 */
export default function SplitLoginHandoff({ storageKey, fallback = null }) {
  const handedOff = useRef(false);
  const [giveUp, setGiveUp] = useState(false);

  useEffect(() => {
    // React StrictMode runs effects twice in dev; the ref makes the second run
    // a no-op without breaking a later remount (a real unmount gets a fresh
    // ref, so signing out and returning to /login hands off again).
    if (handedOff.current) return;
    handedOff.current = true;

    const { at, tries } = readHandoff(storageKey);
    const bounced = Date.now() - at < BOUNCE_MS;
    const attempt = bounced ? tries + 1 : 1;
    writeHandoff(storageKey, Date.now(), attempt);

    if (attempt > MAX_HANDOFFS) {
      setGiveUp(true);
      return;
    }
    window.location.replace(bounced ? '/login-split.html' : '/login');
  }, [storageKey]);

  if (!giveUp) return null;
  return fallback;
}
