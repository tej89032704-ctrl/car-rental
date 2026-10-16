import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from './api.js';
import LocationPicker from './LocationPicker.jsx';

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
            <label className="f" htmlFor="pd-gender">Gender</label>
            <select id="pd-gender" className="f" value={f.gender} onChange={set('gender')}>
              <option value="">Prefer not to say</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="f" htmlFor="pd-address">Address</label>
            <input id="pd-address" className="f" value={f.address_line} onChange={set('address_line')}
              placeholder="Flat / street" autoComplete="street-address" />
          </div>

          <div className="field">
            <label className="f" htmlFor="pd-city">City</label>
            <input id="pd-city" className="f" value={f.city} onChange={set('city')}
              placeholder="Bengaluru" autoComplete="address-level2" />
          </div>

          <div className="field">
            <label className="f" htmlFor="pd-state">State</label>
            <input id="pd-state" className="f" value={f.state} onChange={set('state')}
              placeholder="Karnataka" autoComplete="address-level1" />
          </div>

          <div className="field">
            <label className="f" htmlFor="pd-pincode">PIN code</label>
            <input id="pd-pincode" className="f" value={f.pincode} onChange={set('pincode')}
              placeholder="560001" inputMode="numeric" pattern="\d{4,10}"
              autoComplete="postal-code" />
          </div>

          <div className="field">
            <label className="f">Map location</label>
            <LocationPicker value={pin} onChange={setPin} city={f.city} />
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
