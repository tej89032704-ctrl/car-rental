import { useEffect, useState } from 'react';
import { api } from './api.js';

/**
 * PIN code -> the places it covers.
 *
 * India's PIN code is the fastest thing anyone can type about their address,
 * and six digits already identify the post office and its district. The server
 * resolves them (through the same rate-limited geocoder the map uses), and the
 * form offers what comes back so "city" and "state" are one click instead of
 * three fields.
 *
 * Typing is debounced: six digits can arrive character by character from an
 * autofill, and every call costs a share of a one-per-second pool.
 */
export function usePinPlaces(pincode, delay = 400) {
  const digits = String(pincode || '').replace(/[^0-9]/g, '');
  const ready = digits.length === 6;
  const [state, setState] = useState({ places: [], busy: false, unavailable: false });

  useEffect(() => {
    if (!ready) {
      setState({ places: [], busy: false, unavailable: false });
      return undefined;
    }
    let live = true;
    setState({ places: [], busy: true, unavailable: false });
    const timer = setTimeout(async () => {
      try {
        const body = await api(`/geo/pincode?pin=${digits}`);
        if (!live) return;
        setState({
          places: Array.isArray(body?.places) ? body.places : [],
          busy: false,
          unavailable: !!body?.unavailable,
        });
      } catch {
        if (!live) return;
        setState({ places: [], busy: false, unavailable: true });
      }
    }, delay);

    return () => { live = false; clearTimeout(timer); };
  }, [digits, ready, delay]);

  return state;
}

/** The list itself: one chip per area, showing the city and state it implies. */
export default function PinPlaces({ places, busy, unavailable, onPick, pin }) {
  if (busy) return <p className="pin-places-note">Looking up {pin}…</p>;
  if (unavailable) {
    return <p className="pin-places-note">PIN lookup is unavailable right now — type your city and state.</p>;
  }
  if (!places.length) return null;

  return (
    <ul className="pin-places" aria-label={`Places for PIN ${pin}`}>
      {places.map((p) => {
        // A PIN the geocoder files only by city has no area to name, so the
        // chip is labelled with the city -- and then the detail line must not
        // repeat it ("Mumbai · Mumbai, Maharashtra").
        const label = p.area || p.city;
        const detail = [p.city, p.state].filter((v) => v && v !== label);
        return (
          <li key={`${p.area}-${p.city}-${p.latitude}`}>
            <button type="button" onClick={() => onPick(p)}>
              {label}
              <small>{detail.length ? ` · ${detail.join(', ')}` : ''}</small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Point -> address, for filling the form after the pin is dropped on the map. */
export async function reverseAddress(latitude, longitude) {
  try {
    const body = await api(`/geo/reverse?lat=${latitude}&lng=${longitude}`);
    return body?.address || null;
  } catch {
    return null;
  }
}
