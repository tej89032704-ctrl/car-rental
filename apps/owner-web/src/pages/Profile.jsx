import { useEffect, useMemo, useState } from 'react';
import { api, setSession } from '../api.js';
import { useData } from '../data.jsx';
import { avatarBg } from '../lib.js';
import {
  STATE_NAMES, citiesForState, canonicalState, canonicalCity, stateOfCity,
} from '../../../../packages/shared/src/india.js';
import SuggestInput from '../../../../packages/shared/src/SuggestInput.jsx';
import PinPlaces, { usePinPlaces } from '../../../../packages/shared/src/PinPlaces.jsx';

const ROLE_LABEL = { car_renter: 'Renter', car_owner: 'Owner', agent: 'Agent', super_admin: 'Administrator' };
const KYC_LABEL = { approved: 'KYC verified', pending: 'KYC pending', rejected: 'KYC rejected' };

const EMPTY = {
  form: { name: '', phone: '' },
  details: { date_of_birth: '', gender: '', address_line: '', city: '', state: '', pincode: '' },
};

/**
 * One account, three things people come here for: who am I, is my KYC done,
 * and how do I fix my details. /auth/me (via the shared context) is the
 * source of truth rather than the cached localStorage copy, because the
 * cached one goes stale the moment another device edits the same account.
 */
export default function Profile() {
  const { profile, subs, errors, reload } = useData();
  const me = profile?.user;

  const [form, setForm] = useState(EMPTY.form);
  const [details, setDetails] = useState(EMPTY.details);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // City suggestions follow the state field, falling back to the whole country.
  // Both lists are suggestions, never a whitelist: the API stores free text, so
  // an address the bundled list has never heard of is still saveable.
  const stateOptions = useMemo(() => STATE_NAMES.map((value) => ({ value })), []);
  const cityOptions = useMemo(
    () => citiesForState(details.state).map((value) => ({ value })),
    [details.state],
  );

  // Six digits are enough to name the post office and its district, so the PIN
  // offers the places it covers instead of asking for city and state twice.
  const pinLookup = usePinPlaces(details.pincode);

  function pickPlace(place) {
    setDetails((d) => ({
      ...d,
      city: place.city ? canonicalCity(place.city, place.state) : d.city,
      state: place.state ? canonicalState(place.state) : d.state,
    }));
  }

  // The state field is free text, so on the way out it is reconciled with the
  // bundled spelling ("karnataka" -> "Karnataka") and left alone if it matches
  // nothing, which is the case for a place only the user knows.
  function tidyState() {
    setDetails((d) => ({ ...d, state: canonicalState(d.state) }));
  }

  // Picking a city first fills the state when exactly one state claims it.
  function tidyCity() {
    setDetails((d) => {
      const city = canonicalCity(d.city, d.state);
      return { ...d, city, state: d.state.trim() ? d.state : stateOfCity(city) };
    });
  }

  // Seed the form once per account id: reload() re-reads /auth/me after a
  // save, and re-seeding on every context refresh would clobber edits the
  // owner is still typing.
  useEffect(() => {
    if (!me) return;
    setForm({ name: me.name || '', phone: me.phone || '' });
    setDetails({
      // The date input wants YYYY-MM-DD; the API may hand back a timestamp.
      date_of_birth: String(me.date_of_birth || '').slice(0, 10),
      gender: me.gender || '',
      address_line: me.address_line || '',
      city: me.city || '',
      state: me.state || '',
      pincode: me.pincode || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const d = await api('/auth/me', { method: 'PATCH', body: { ...form, ...details } });
      // The sidebar caches its own user copy, so refresh it alongside the
      // shared context, which re-reads every endpoint from the server.
      setSession({ user: d.user });
      setMsg(d.changed ? 'Profile updated.' : 'No changes to save.');
      reload();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const kycLabel = KYC_LABEL[me?.kyc_status] || KYC_LABEL.pending;
  const activeSubs = (subs || []).filter((s) => s.status === 'active').length;

  return (
    <>
      <div className="hd">
        <div>
          <h2>Profile</h2>
          <p>Your account details, verification status and contact information</p>
        </div>
      </div>

      {!profile && !errors.profile && <div className="sk" />}
      {errors.profile && <div className="alert err">{errors.profile}</div>}

      {me && (
        <>
          {/* ---------------------------- avatar header ------------------- */}
          <div className="sc" style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24 }}>
            <div
              className="av"
              style={{ width: 72, height: 72, fontSize: 28, background: avatarBg(me.name) }}
            >
              {(me.name || '?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ font: '500 26px Fraunces' }}>{me.name}</h3>
              <p className="muted" style={{ marginTop: 2 }}>
                {ROLE_LABEL[me.role] || 'Car owner'}{me.city ? ` · ${me.city}` : ''}
              </p>
              <span className="tag a" style={{ display: 'inline-block', marginTop: 8 }}>{kycLabel}</span>
            </div>
          </div>

          {/* ------------------------------- the form -------------------- */}
          <p className="ey">Edit details</p>
          {msg && <div className="alert good">{msg}</div>}
          {err && <div className="alert err">{err}</div>}

          <form className="fm" onSubmit={save}>
            <label>
              Full name
              <input
                value={form.name}
                required
                minLength={2}
                maxLength={120}
                placeholder="Your full name"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>

            <label>
              Email
              <input type="email" value={me.email || ''} readOnly />
              <small className="muted" style={{ display: 'block', marginTop: 6, fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>
                Your sign-in ID — it can't be changed here.
              </small>
            </label>

            <label>
              Phone
              <input
                value={form.phone}
                required
                placeholder="+91 98765 43210"
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>

            <label>
              Date of birth
              <input
                type="date"
                value={details.date_of_birth}
                onChange={(e) => setDetails({ ...details, date_of_birth: e.target.value })}
              />
            </label>

            <label>
              Gender
              <select
                value={details.gender}
                style={{ width: '100%', marginTop: 8, padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--bg)', outline: 0, color: 'var(--ink)', font: 'inherit' }}
                onChange={(e) => setDetails({ ...details, gender: e.target.value })}
              >
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non_binary">Non-binary</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </label>

            <label style={{ gridColumn: '1 / -1' }}>
              Address line
              <input
                value={details.address_line}
                placeholder="Flat / street"
                onChange={(e) => setDetails({ ...details, address_line: e.target.value })}
              />
            </label>

            <label>
              State
              {/* A real dropdown with a chevron: the native datalist this
                  replaced accepted free text but advertised nothing, so the
                  list was only ever found by accident. */}
              <SuggestInput value={details.state} onChange={(e) => setDetails({ ...details, state: e.target.value })}
                onBlurValue={tidyState} options={stateOptions}
                placeholder="Karnataka" ariaLabel="State" />
            </label>

            <label>
              City
              <SuggestInput value={details.city} onChange={(e) => setDetails({ ...details, city: e.target.value })}
                onBlurValue={tidyCity} options={cityOptions}
                placeholder="Bengaluru" ariaLabel="City" />
            </label>

            <label>
              Pincode
              <input
                value={details.pincode}
                inputMode="numeric"
                placeholder="560001"
                onChange={(e) => setDetails({ ...details, pincode: e.target.value })}
              />
              <PinPlaces {...pinLookup} pin={String(details.pincode || '').replace(/[^0-9]/g, '')} onPick={pickPlace} />
            </label>

            <div style={{ gridColumn: '1 / -1' }}>
              <button className="b" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>

          {/* ---------------------------- account facts ------------------ */}
          <p className="ey" style={{ marginTop: 32 }}>Account at a glance</p>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 26 }}>{kycLabel}</div>
              <div className="stat-label">KYC status</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 26 }}>
                {me.phone_verified_at ? <span style={{ color: 'var(--ok)' }}>Verified ✓</span> : <a href="/verify-otp" style={{ fontSize: 18, color: 'var(--acc)' }}>Verify now →</a>}
              </div>
              <div className="stat-label">Phone verification</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 26 }}>{me.profile_completed ? 'Yes' : 'No'}</div>
              <div className="stat-label">Profile completed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 26 }}>{activeSubs}</div>
              <div className="stat-label">Active subscriptions</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
