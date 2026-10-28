import { useEffect, useMemo, useState } from 'react';
import { ALL_CITIES } from '../../../../packages/shared/src/india.js';
import { api } from '../api.js';

/**
 * The pick-up city, BookMyShow style: search a box, detect where you are, tap
 * a popular city, or pick from the whole-country list.
 *
 * A free-text input was the wrong shape for this field. Nobody types "pick-up
 * location" the way they type an address — they want their city, and the three
 * questions that follow are always the same: can I search it, is my city in
 * the shortcuts, and can the app work out where I am. The modal answers all
 * three in the order they are asked.
 *
 * Detection goes through the API's reverse geocoder rather than a browser-side
 * lookup, so the shared one-per-second Nominatim queue stays under the
 * server's control. That endpoint needs a session, so a signed-out visitor
 * gets the coordinates but not the name — the picker says so and leaves the
 * list open instead of failing silently.
 */

const POPULAR = [
  { label: 'Mumbai', value: 'Mumbai' },
  { label: 'Delhi-NCR', value: 'Delhi' },
  { label: 'Bengaluru', value: 'Bengaluru' },
  { label: 'Hyderabad', value: 'Hyderabad' },
  { label: 'Chennai', value: 'Chennai' },
  { label: 'Pune', value: 'Pune' },
  { label: 'Kolkata', value: 'Kolkata' },
  { label: 'Ahmedabad', value: 'Ahmedabad' },
  { label: 'Jaipur', value: 'Jaipur' },
  { label: 'Kochi', value: 'Kochi' },
  { label: 'Goa', value: 'Panaji' },
  { label: 'Lucknow', value: 'Lucknow' },
];

const Skyline = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    <path d="M3 21h18M6 21V9l5-3v15M14.5 21V12l4.5 2v7M8.5 11.5h1M8.5 15h1M16.5 16h1" />
  </svg>
);

const Glass = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4.2-4.2" />
  </svg>
);

const Crosshair = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="7" />
    <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
  </svg>
);

export default function CityPicker({ open, value, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Start clean each time it opens: a leftover search from last visit reads as
  // "the list is broken" when it comes back empty.
  useEffect(() => {
    if (open) { setQuery(''); setNote(''); }
  }, [open]);

  // Esc closes and the page behind stops scrolling while the dialog is up.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  // Popular shortcuts that also match what is typed — "goa" finds the Goa tile
  // even though the list calls it Panaji.
  const popularHits = useMemo(() => {
    if (!lower) return POPULAR;
    return POPULAR.filter(
      (p) => p.label.toLowerCase().includes(lower) || p.value.toLowerCase().includes(lower),
    );
  }, [lower]);

  // Starts-with before contains, so "del" offers Delhi ahead of Delliganj, and
  // cap it: past ~80 rows the list is a scroll exercise, not a choice.
  const results = useMemo(() => {
    if (!lower) return null;
    const starts = [];
    const inside = [];
    for (const city of ALL_CITIES) {
      const key = city.toLowerCase();
      if (key.startsWith(lower)) starts.push(city);
      else if (key.includes(lower)) inside.push(city);
    }
    return [...starts, ...inside].slice(0, 80);
  }, [lower]);

  // Anything that is not a listed city can still be typed: plenty of pickups
  // happen in a locality that no country list knows about.
  const exact = ALL_CITIES.some((c) => c.toLowerCase() === lower);

  function choose(city) {
    setNote('');
    onPick(city);
  }

  // A locality typed by hand starts lowercase far more often than not; the
  // trigger is a display field, so "whitefield" reads as a bug there.
  const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

  function detect() {
    setNote('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNote('This browser cannot share a location. Search for your city instead.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const body = await api(
            `/geo/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`,
          );
          const city = body?.address?.city;
          if (city) { choose(city); return; }
          setNote(
            body?.throttled
              ? 'One lookup at a time — try again in a moment.'
              : 'Found you, but we could not name the city. Pick it from the list.',
          );
        } catch (e) {
          // 401/403 is the common case -- the reverse geocoder needs a session,
          // so a visitor browsing signed out gets coordinates but no name. Any
          // other failure is the service being down, which is not the user's
          // fault and must not be blamed on their account.
          const refused = /\b40[13]\b/.test(e?.message || '');
          setNote(refused
            ? 'Found you, but naming the city needs a signed-in account. Pick it from the list.'
            : 'Found you, but the city lookup is unavailable right now. Pick it from the list.');
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setNote('Location access was blocked. Search for your city instead.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  if (!open) return null;

  const cityButton = (city, label = city) => (
    <button
      key={`${label}-${city}`}
      type="button"
      className={`cp-city${value === city ? ' on' : ''}`}
      onClick={() => choose(city)}
    >
      <Skyline />
      <span>{label}</span>
    </button>
  );

  return (
    <div
      className="cp-scrim"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cp" role="dialog" aria-modal="true" aria-label="Choose your pick-up city">
        <div className="cp-hd">
          <div>
            <h2>Choose your pick-up city</h2>
            <p>We bring the car to you in these cities.</p>
          </div>
          <button type="button" className="cp-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="cp-search">
          <Glass />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter takes the first match when there is one, so the whole
              // task can be done from the keyboard.
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const first = results?.[0];
              if (first) choose(first);
              else if (trimmed) choose(titleCase(trimmed));
            }}
            placeholder="Search for your city"
            aria-label="Search for your city"
          />
        </div>

        <button type="button" className="cp-detect" onClick={detect} disabled={busy}>
          <Crosshair />
          {busy ? 'Finding your city…' : 'Use my current location'}
        </button>

        {note && <p className="cp-note" role="status">{note}</p>}

        {results ? (
          <div className="cp-sec">
            <h3>{popularHits.length ? 'Popular' : `Cities matching “${trimmed}”`}</h3>
            {popularHits.length > 0 && (
              <div className="cp-pop">
                {popularHits.map((p) => cityButton(p.value, p.label))}
              </div>
            )}

            {!exact && trimmed && (
              <button type="button" className="cp-typed" onClick={() => choose(titleCase(trimmed))}>
                Search for “{trimmed}”
              </button>
            )}

            {results.length > 0 && (
              <>
                <h3 style={{ marginTop: popularHits.length || !exact ? 16 : 0 }}>
                  {popularHits.length ? `All cities matching “${trimmed}”` : 'All cities'}
                </h3>
                <div className="cp-all">
                  {results.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={value === c ? 'on' : ''}
                      onClick={() => choose(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </>
            )}

            {!results.length && !popularHits.length && trimmed && (
              <p className="cp-empty">No listed city matches “{trimmed}” — use the line above to search for it anyway.</p>
            )}
          </div>
        ) : (
          <div className="cp-sec">
            <h3>Popular cities</h3>
            <div className="cp-pop">
              {POPULAR.map((p) => cityButton(p.value, p.label))}
            </div>

            <h3 style={{ marginTop: 18 }}>All cities</h3>
            <div className="cp-all">
              {ALL_CITIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={value === c ? 'on' : ''}
                  onClick={() => choose(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
