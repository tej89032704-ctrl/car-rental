import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from './api.js';
import LocationPicker from './LocationPicker.jsx';
import SuggestInput from './SuggestInput.jsx';
import PinPlaces, { reverseAddress, usePinPlaces } from './PinPlaces.jsx';
import {
  STATE_NAMES, citiesForState, canonicalState, canonicalCity, stateOfCity,
} from './india.js';

/**
 * Post-signup profile details, shared by all three portals.
 *
 * Signup only collects what authentication needs. This page runs immediately
 * afterwards and asks for the rest: date of birth, gender, and where the user
 * lives. It is a nudge, not a gate — every field except date of birth can be
 * skipped, and nothing here blocks browsing or booking (that is KYC's job,
 * see KycGateGuard).
 *
 * Date of birth is stored as a date, never as an age: a stored age is wrong
 * in a year's time. The API returns a derived `age` for display.
 */

const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

/** Icons for the gender chips; `other` and `prefer_not_to_say` share the
 *  neutral palette so the picker still covers every stored value. */
const GENDER_ICONS = {
  male: (
    <svg viewBox="0 0 24 24">
      <path d="M15.5631 16.1199C14.871 16.81 13.9885 17.2774 13.0288 17.462C12.0617 17.6492 11.0607 17.5459 10.1523 17.165C8.29113 16.3858 7.07347 14.5723 7.05656 12.5547C7.04683 11.0715 7.70821 9.66348 8.8559 8.72397C10.0036 7.78445 11.5145 7.4142 12.9666 7.71668C13.9237 7.9338 14.7953 8.42902 15.4718 9.14008C16.4206 10.0503 16.9696 11.2996 16.9985 12.6141C17.008 13.9276 16.491 15.1903 15.5631 16.1199Z" />
      <path d="M14.9415 8.60977C14.6486 8.90266 14.6486 9.37754 14.9415 9.67043C15.2344 9.96332 15.7093 9.96332 16.0022 9.67043L14.9415 8.60977ZM18.9635 6.70907C19.2564 6.41617 19.2564 5.9413 18.9635 5.64841C18.6706 5.35551 18.1958 5.35551 17.9029 5.64841L18.9635 6.70907ZM16.0944 5.41461C15.6802 5.41211 15.3424 5.74586 15.3399 6.16007C15.3374 6.57428 15.6711 6.91208 16.0853 6.91458L16.0944 5.41461ZM18.4287 6.92872C18.8429 6.93122 19.1807 6.59747 19.1832 6.18326C19.1857 5.76906 18.8519 5.43125 18.4377 5.42875L18.4287 6.92872ZM19.1832 6.17421C19.1807 5.76001 18.8429 5.42625 18.4287 5.42875C18.0145 5.43125 17.6807 5.76906 17.6832 6.18326L19.1832 6.17421ZM17.6973 8.52662C17.6998 8.94082 18.0377 9.27458 18.4519 9.27208C18.8661 9.26958 19.1998 8.93177 19.1973 8.51756L17.6973 8.52662ZM16.0022 9.67043L18.9635 6.70907L17.9029 5.64841L14.9415 8.60977L16.0022 9.67043ZM16.0853 6.91458L18.4287 6.92872L18.4377 5.42875L16.0944 5.41461L16.0853 6.91458ZM17.6832 6.18326L17.6973 8.52662L19.1973 8.51756L19.1832 6.17421L17.6832 6.18326Z" />
    </svg>
  ),
  female: (
    <svg viewBox="0 0 24 24">
      <path d="M20 9C20 13.0803 16.9453 16.4471 12.9981 16.9383C12.9994 16.9587 13 16.9793 13 17V19H14C14.5523 19 15 19.4477 15 20C15 20.5523 14.5523 21 14 21H13V22C13 22.5523 12.5523 23 12 23C11.4477 23 11 22.5523 11 22V21H10C9.44772 21 9 20.5523 9 20C9 19.4477 9.44772 19 10 19H11V17C11 16.9793 11.0006 16.9587 11.0019 16.9383C7.05466 16.4471 4 13.0803 4 9C4 4.58172 7.58172 1 12 1C16.4183 1 20 4.58172 20 9ZM6.00365 9C6.00365 12.3117 8.68831 14.9963 12 14.9963C15.3117 14.9963 17.9963 12.3117 17.9963 9C17.9963 5.68831 15.3117 3.00365 12 3.00365C8.68831 3.00365 6.00365 5.68831 6.00365 9Z" />
    </svg>
  ),
  non_binary: (
    <svg viewBox="0 0 512 512">
      <g transform="translate(42.666667 70.248389)">
        <path d="M226.597,200.834611 L296.853333,271.084945 L353.819,271.084 L326.248389,243.503223 L356.418278,213.333333 L435.503223,292.418278 L356.418278,371.503223 L326.248389,341.333333 L353.82,313.751 L279.163435,313.751611 L196.418,231.011611 L226.597,200.834611 Z M356.418278,1.42108547e-14 L435.503223,79.0849447 L356.418278,158.169889 L326.248389,128 L353.82,100.418 L296.853333,100.418278 L83.503232,313.751611 L-1.0658141e-13,313.751611 L-1.0658141e-13,271.084945 L65.8133333,271.084945 L279.163435,57.7516113 L353.82,57.751 L326.248389,30.1698893 L356.418278,1.42108547e-14 Z M83.503232,57.7516113 L166.248,140.490611 L136.069,170.667611 L65.8133333,100.418278 L-1.0658141e-13,100.418278 L-1.0658141e-13,57.7516113 L83.503232,57.7516113 Z" />
      </g>
    </svg>
  ),
  other: (
    <svg viewBox="0 0 24 24">
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  ),
  prefer_not_to_say: (
    <svg viewBox="0 0 24 24">
      <path d="M8.19531 8.76498C8.42304 8.06326 8.84053 7.43829 9.40137 6.95899C9.96221 6.47968 10.6444 6.16501 11.373 6.0494C12.1017 5.9338 12.8486 6.02202 13.5303 6.3042C14.2119 6.58637 14.8016 7.05166 15.2354 7.64844C15.6691 8.24521 15.9295 8.95008 15.9875 9.68554C16.0455 10.421 15.8985 11.1581 15.5636 11.8154C15.2287 12.4728 14.7192 13.0251 14.0901 13.4106C13.4611 13.7961 12.7377 14.0002 12 14.0002V14.9998M12.0498 19V19.1L11.9502 19.1002V19H12.0498Z" />
    </svg>
  ),
};

const EMPTY = {
  date_of_birth: '', gender: '', address_line: '', city: '', state: '', pincode: '',
};

/** Oldest and newest selectable dates, matching the API's 16..120 bounds. */
export function dobBounds() {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const oldest = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
  const youngest = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate());
  return { min: iso(oldest), max: iso(youngest) };
}

export default function ProfileDetails({ next = '/kyc', heading = 'A few more details' } = {}) {
  const nav = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // Held apart from `f` because it is a pair of numbers plus a provenance tag,
  // not a form string, and it is submitted differently.
  const [pin, setPin] = useState(null);
  const [looking, setLooking] = useState(false);
  // Set when the point could not be turned into an address, so the empty boxes
  // read as "nothing was found here" rather than as a silent failure.
  const [lookFailed, setLookFailed] = useState(false);
  const bounds = dobBounds();

  // Prefill from the server rather than localStorage: another device may have
  // already filled this in, and showing a blank form over saved data invites
  // the user to overwrite it with blanks.
  useEffect(() => {
    api('/auth/me')
      .then((d) => {
        const u = d.user || {};
        setF({
          date_of_birth: u.date_of_birth || '',
          gender: u.gender || '',
          address_line: u.address_line || '',
          city: u.city || '',
          state: u.state || '',
          pincode: u.pincode || '',
        });
        if (typeof u.latitude === 'number' && typeof u.longitude === 'number') {
          setPin({
            latitude: u.latitude,
            longitude: u.longitude,
            source: u.location_source || 'manual',
          });
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // State and city suggest the bundled India list but accept anything typed:
  // the API stores free text, and plenty of towns are not on any list.
  const stateOptions = useMemo(() => STATE_NAMES.map((value) => ({ value })), []);
  const cityOptions = useMemo(() => citiesForState(f.state).map((value) => ({ value })), [f.state]);

  // A six-digit PIN names the post office, so the places it covers are offered
  // instead of asking for city and state a second time.
  const pinLookup = usePinPlaces(f.pincode);

  function pickPlace(place) {
    setF((v) => ({
      ...v,
      city: place.city ? canonicalCity(place.city, place.state) : v.city,
      state: place.state ? canonicalState(place.state) : v.state,
    }));
  }

  // Dropping the pin resolves what is underneath it, so the address fields
  // describe the place the pin actually sits on rather than the city that was
  // typed before the user moved it.
  const onPinChange = useCallback(async (next) => {
    setPin(next);
    setLookFailed(false);
    if (!next) return;
    setLooking(true);
    const address = await reverseAddress(next.latitude, next.longitude);
    setLooking(false);
    if (!address) {
      setLookFailed(true);
      return;
    }
    setF((v) => ({
      ...v,
      address_line: address.address_line || v.address_line,
      city: address.city ? canonicalCity(address.city, address.state) : v.city,
      state: address.state ? canonicalState(address.state) : v.state,
      pincode: address.pincode || v.pincode,
    }));
  }, []);

  function tidyState() {
    setF((v) => ({ ...v, state: canonicalState(v.state) }));
  }

  // Choosing a city fills the state when only one state claims that name.
  function tidyCity() {
    setF((v) => {
      const city = canonicalCity(v.city, v.state);
      const state = v.state.trim() ? v.state : stateOfCity(city);
      return { ...v, city, state };
    });
  }

  // Only send keys the user actually filled in. Sending '' for every untouched
  // field would write empty strings over anything already stored.
  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = Object.fromEntries(
        Object.entries(f).filter(([, v]) => v !== '' && v !== null && v !== undefined),
      );
      // Sent whenever it differs from what is stored. The API treats an absent
      // key as "leave it alone" and an explicit pair as "this is the pin", so
      // only a pin the user actually placed or moved is transmitted.
      if (pin) {
        body.latitude = pin.latitude;
        body.longitude = pin.longitude;
      }
      if (!Object.keys(body).length) {
        nav(next);
        return;
      }
      const d = await api('/auth/me', { method: 'PATCH', body });
      // The sidebar polls the cached user, so refresh it to pick up the new
      // fields without a reload.
      if (d?.user) setSession({ user: d.user });
      nav(next);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    nav(next);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card-center">
        <div className="portal-tag">Almost done</div>
        <h1>{heading}</h1>
        <p className="sub">
          This helps us show relevant cars near you and speeds up verification. You can change
          any of it later in your profile.
        </p>

        {err && <div className="alert err">{err}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label className="f" htmlFor="pd-dob">Date of birth</label>
            <input id="pd-dob" className="f" type="date" required
              min={bounds.min} max={bounds.max}
              value={f.date_of_birth} onChange={set('date_of_birth')} />
            <small className="form-hint">You must be at least 16 to rent.</small>
          </div>

          <div className="field">
            <label className="f">Gender</label>
            <div className="gpick" role="radiogroup" aria-label="Gender">
              {GENDERS.map((g) => (
                <label key={g.value} className="gchip" data-g={g.value} title={g.label}>
                  <input
                    type="radio"
                    name="gender"
                    value={g.value}
                    checked={f.gender === g.value}
                    onChange={() => setF((v) => ({ ...v, gender: g.value }))}
                    aria-label={g.label}
                  />
                  <span className="gburst" aria-hidden="true" />
                  <span className="gdisc" aria-hidden="true">{GENDER_ICONS[g.value]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="f" htmlFor="pd-address">Address</label>
            <input id="pd-address" className="f" value={f.address_line} onChange={set('address_line')}
              placeholder="Flat / street" autoComplete="street-address" />
          </div>

          {/* State before city so the city list can narrow to it. Both are
              type-ahead suggestions with a hand-typed fallback. */}
          <div className="field">
            <label className="f" htmlFor="pd-state">State</label>
            <SuggestInput id="pd-state" inputClassName="f" value={f.state} onChange={set('state')}
              onBlurValue={tidyState} options={stateOptions}
              placeholder="Karnataka" ariaLabel="State" />
          </div>

          <div className="field">
            <label className="f" htmlFor="pd-city">City</label>
            <SuggestInput id="pd-city" inputClassName="f" value={f.city} onChange={set('city')}
              onBlurValue={tidyCity} options={cityOptions}
              placeholder="Bengaluru" ariaLabel="City" />
          </div>

          <div className="field">
            <label className="f" htmlFor="pd-pincode">PIN code</label>
            <input id="pd-pincode" className="f" value={f.pincode} onChange={set('pincode')}
              placeholder="560001" inputMode="numeric" pattern="\d{4,10}"
              autoComplete="postal-code" />
            <PinPlaces {...pinLookup} pin={f.pincode.replace(/[^0-9]/g, '')} onPick={pickPlace} />
          </div>

          <div className="field">
            <label className="f">Map location</label>
            <LocationPicker value={pin} onChange={onPinChange} city={f.city} />
            {looking && <small className="form-hint" role="status">Filling the address from the map…</small>}
            {!looking && lookFailed && (
              <small className="form-hint" role="status">
                This point has no address on record — fill the fields above by hand.
              </small>
            )}
            <small className="form-hint">
              Optional. Lets owners see which cars are near you, and renters see roughly where a
              car is kept. Only shared with people viewing your cars.
            </small>
          </div>

          <button className="btn btn-full" disabled={busy || loading}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </form>

        <p style={{ marginTop: 16, textAlign: 'center' }}>
          <button type="button" onClick={skip}
            style={{ background: 'none', border: 'none', color: 'var(--acc-text)', fontWeight: 700,
                     fontSize: 13, cursor: 'pointer', padding: '8px 16px', borderRadius: 8 }}>
            Skip for now
          </button>
        </p>
      </div>
    </div>
  );
}
