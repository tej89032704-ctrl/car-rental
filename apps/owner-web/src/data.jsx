import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, sessionUser } from './api.js';

/**
 * One load for the whole panel, but fetched per endpoint rather than as a
 * single all-or-nothing Promise.all: the reference could render each section
 * against a different truth, and losing the wallet call should not cost you
 * the fleet. Every field carries its own error, so a section can show a
 * Retry card while its neighbours stay usable.
 *
 * `reload()` is what the section actions call after a write (approve, list a
 * car, request a payout) so the panel re-reads server state instead of
 * hand-mutating a local copy that a refresh would silently discard.
 */
const Ctx = createContext(null);

export const useData = () => useContext(Ctx);

const INITIAL = {
  cars: [],
  requests: [],
  extensions: [],
  completed: [],
  about: null,     // { avg_rating, total_reviews, reviews[] }
  written: [],     // reviews this owner left
  notifications: [],
  earnings: null,  // { wallet, payouts, transactions }
  purchases: null, // { plan, subscription, active, purchases[] } -- owner billing
  subs: [],
  profile: null,   // /auth/me
  kyc: null,       // { required_docs, complete, documents[] }
};

export function DataProvider({ children }) {
  const [data, setData] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  /* The flag has to be re-armed on every setup, not just cleared on teardown:
     StrictMode runs setup -> cleanup -> setup, and a ref that is only ever
     nulled would leave every pull() bailing out before it touched state --
     no error, no data, and an empty panel that looks perfectly healthy. */
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const pull = useCallback(async (key, path, fallback, map) => {
    try {
      const raw = await api(path);
      const value = map ? map(raw) : raw;
      if (!mounted.current) return;
      setData((d) => ({ ...d, [key]: value }));
      setErrors((e) => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n; });
    } catch (err) {
      if (!mounted.current) return;
      setData((d) => ({ ...d, [key]: fallback }));
      setErrors((e) => ({ ...e, [key]: err.message || 'Request failed' }));
    }
  }, []);

  const reload = useCallback(async () => {
    if (!sessionUser()) return;
    setLoading(true);
    await Promise.all([
      pull('cars', '/cars/mine', []),
      pull('requests', '/bookings/requests', []),
      pull('extensions', '/extensions', []),
      pull('completed', '/bookings/completed', []),
      pull('about', '/reviews/about-me', { avg_rating: 0, total_reviews: 0, reviews: [] }),
      pull('written', '/reviews/my', []),
      pull('notifications', '/notifications/mine', []),
      pull('earnings', '/payments/earnings', { wallet: { available_balance_paise: 0, pending_balance_paise: 0 }, payouts: [], transactions: [] }),
      pull('subs', '/subscriptions/mine', []),
      pull('purchases', '/payments/purchases', null),
      pull('profile', '/auth/me', null),
      pull('kyc', '/kyc/me', { required_docs: [], complete: false, documents: [] }),
    ]);
    if (mounted.current) setLoading(false);
  }, [pull]);

  useEffect(() => {
    if (sessionUser()) reload();
    else { setData(INITIAL); setLoading(false); }
  }, [reload]);

  const value = useMemo(() => ({ ...data, errors, loading, reload }), [data, errors, loading, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------ derived views ---------------------------- *
 * The panel's three request tabs, the live strip and the calendar all read
 * from these, so the mapping from booking status -> tab lives in one place.  */

export const isPending = (b) => b.status === 'requested' || b.status === 'pending';
export const isApproved = (b) => ['confirmed', 'ongoing', 'completed'].includes(b.status);
export const isDeclined = (b) => ['rejected', 'declined', 'cancelled'].includes(b.status);

/** All rows the Requests section can show, tagged with which tab owns them. */
export function useRequestRows() {
  const { requests, completed } = useData();
  return useMemo(() => {
    return [...(requests || []), ...(completed || [])].map((b) => ({
      ...b, tab: isPending(b) ? 'p' : isApproved(b) ? 'a' : 'd',
    }));
  }, [requests, completed]);
}

/** Per-car trip count and lifetime earnings, aggregated from completed trips. */
export function useCarStats() {
  const { completed } = useData();
  return useMemo(() => {
    const map = new Map();
    for (const b of completed || []) {
      const id = b.car?.id;
      if (!id) continue;
      const cur = map.get(id) || { trips: 0, earned: 0 };
      cur.trips += 1;
      cur.earned += Number(b.total_amount_paise) || 0;
      map.set(id, cur);
    }
    return map;
  }, [completed]);
}

/** Unread = server flag plus anything the visitor dismissed this browser. */
export function useUnread() {
  const { notifications } = useData();
  const [seen, setSeen] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('oh-read') || '[]')); } catch { return new Set(); }
  });
  const mark = useCallback((ids) => {
    setSeen((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      try { localStorage.setItem('oh-read', JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  }, []);
  const list = notifications || [];
  const unread = list.filter((n) => !n.read_at && !seen.has(n.id));
  return { list, unread, seen, mark };
}
