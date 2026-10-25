import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearSession, setSession } from '../api.js';
import {
  STATE_NAMES, citiesForState, canonicalState, canonicalCity, stateOfCity,
} from '../../../../packages/shared/src/india.js';
import { applyTheme, isDark, toast } from '../components/ui.js';
import DatePicker from '../components/DatePicker.jsx';
import OptionPicker from '../components/OptionPicker.jsx';

// Symbols ride alongside the names so the field reads at a glance; the `value`
// stays the API's enum, which is all that is ever sent.
const GENDERS = [
  { value: 'female', label: 'Female', symbol: '♀' },
  { value: 'male', label: 'Male', symbol: '♂' },
  { value: 'non_binary', label: 'Non-binary', symbol: '⚧' },
  { value: 'other', label: 'Other', symbol: '◈' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say', symbol: '◌' },
];

// Which side of the account this profile is. The portal says "renter" in its
// navigation, but one account can hold either role, so the page states the
// role the server reports rather than assuming the portal's.
const ROLES = {
  car_renter: { label: 'Renter', tone: 'renter' },
  car_owner: { label: 'Owner', tone: 'owner' },
  agent: { label: 'Agent', tone: 'agent' },
  manager: { label: 'Manager', tone: 'owner' },
  super_admin: { label: 'Administrator', tone: 'owner' },
};

const EMPTY = {
  name: '', email: '', phone: '',
  address_line: '', city: '', state: '', pincode: '',
  date_of_birth: '', gender: '',
};

function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function Profile() {
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/me')
      .then((data) => {
        const u = data?.user || data;
        setUser(u);
        setForm({
          name: u.name || '',
          email: u.email || '',
          phone: u.phone || '',
          address_line: u.address_line || '',
          city: u.city || '',
          state: u.state || '',
          pincode: u.pincode || '',
          date_of_birth: u.date_of_birth || '',
          gender: u.gender || '',
        });
        setErr('');
      })
      .catch((e) => setErr(e.message || 'Could not load your profile'))
      .finally(() => setLoading(false));
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // State and city are suggestions, not a whitelist: the API stores whatever
  // is typed, so anywhere that is missing from the list can still be entered.
  const cityOptions = useMemo(() => citiesForState(form.state), [form.state]);

  function tidyState() {
    setForm((f) => ({ ...f, state: canonicalState(f.state) }));
  }

  // Picking a city first (common when typing an address from the top) fills in
  // the state when exactly one state claims that name.
  function tidyCity() {
    setForm((f) => {
      const city = canonicalCity(f.city, f.state);
      const state = f.state.trim() ? f.state : stateOfCity(city);
      return { ...f, city, state };
    });
  }

  async function save(e) {
    if (e?.preventDefault) e.preventDefault();
    if (form.name.trim().length < 2) { setErr('Name is required'); return; }
    if (!/^\+?[0-9]{10,14}$/.test(form.phone.replace(/[\s().-]/g, ''))) {
      setErr('Enter a phone number we can reach you on');
      return;
    }
    if (form.pincode.trim() && !/^\d{4,10}$/.test(form.pincode.trim())) {
      setErr('PIN code should be 4 to 10 digits');
      return;
    }
    if (form.date_of_birth && new Date(`${form.date_of_birth}T00:00:00Z`).getTime() >= Date.now()) {
      setErr('Date of birth must be in the past');
      return;
    }

    setBusy(true);
    setErr('');
    try {
      const body = { name: form.name.trim(), phone: form.phone.replace(/[\s().-]/g, '') };
      // The API validates these with min-length rules, so only send the ones
      // the user actually filled in. An empty string is a rejected payload,
      // not a "clear this field" instruction.
      const optional = ['date_of_birth', 'gender', 'address_line', 'city', 'state', 'pincode'];
      for (const key of optional) {
        const value = (form[key] || '').trim();
        if (value) body[key] = value;
      }
      const data = await api('/auth/me', { method: 'PATCH', body });
      const u = data?.user || data;
      if (u) {
        setUser(u);
        setSession({ user: u });
      }
      toast('Profile saved');
    } catch (e2) {
      setErr(e2.message || 'Could not save your profile');
    } finally {
      setBusy(false);
    }
  }

  function toggleTheme() {
    const next = isDark() ? 'light' : 'dark';
    applyTheme(next);
    toast(next === 'dark' ? 'Dark theme on' : 'Light theme on');
  }

  function logout() {
    clearSession();
    nav('/login');
  }

  function focusField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }

  // Null until the account is known, so the page never claims a role it has
  // not been told yet. Unknown roles fall back to the portal's own side.
  const role = user ? (ROLES[user.role] || ROLES.car_renter) : null;

  // The API reports phone_verified (not raw timestamps), so trust that flag.
  const phoneVerified = !!user?.phone_verified;
  const addressComplete = !!(user?.address_line && user?.city && user?.state && user?.pincode);

  const kycDetails = [
    {
      key: 'dob',
      label: 'Date of birth',
      text: user?.date_of_birth ? prettyDate(user.date_of_birth) : 'Needed for the licence age check',
      done: !!user?.date_of_birth,
      field: 'pd',
    },
    {
      key: 'gender',
      label: 'Gender',
      text: user?.gender
        ? (GENDERS.find((g) => g.value === user.gender)?.label || user.gender)
        : 'As printed on your ID',
      done: !!user?.gender,
      field: 'pg',
    },
    {
      key: 'address',
      label: 'Address',
      text: addressComplete
        ? [user.address_line, user.city, user.state, user.pincode].filter(Boolean).join(', ')
        : 'Street, city, state and PIN code',
      done: addressComplete,
      field: 'pa',
    },
    {
      key: 'phone',
      label: 'Phone number',
      text: phoneVerified ? 'Verified with OTP' : 'Verify with a one-time code',
      done: phoneVerified,
      go: '/verify-otp',
    },
  ];
  const kycDone = kycDetails.filter((d) => d.done).length;

  return (
    <section className="pg">
      <div className="hd">
        <div>
          {role && <span className={`ey role-tag ${role.tone}`}>{role.label} account</span>}
          <h1>Profile</h1>
          <p>Up-to-date details mean faster bookings.</p>
        </div>
      </div>

      {err && <div className="ce-err">{err}</div>}
      {loading && !err && <div className="ce-load"><span className="spinner" /><span>Loading your profile…</span></div>}

      {!loading && (
        <>
          <form className="panel fm" id="profile-form" onSubmit={save}>
            <div className="f">
              <label htmlFor="pn">Full name</label>
              <input id="pn" value={form.name} onChange={set('name')} autoComplete="name" />
            </div>
            <div className="f">
              <label htmlFor="pe">Email</label>
              <input id="pe" value={form.email} readOnly title="Email cannot be changed here" />
            </div>
            <div className="f">
              <label htmlFor="pp">Phone</label>
              <input id="pp" value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
            </div>

            {/* Identity details the licence check needs, beside the address columns. */}
            <div className="f">
              <label htmlFor="pd">Date of birth</label>
              <DatePicker
                id="pd"
                value={form.date_of_birth}
                onChange={(v) => setForm((f) => ({ ...f, date_of_birth: v }))}
                max={new Date().toISOString().slice(0, 10)}
                placeholder="Select date"
                ariaLabel="Date of birth"
              />
            </div>
            <div className="f">
              <label htmlFor="pg">Gender</label>
              <OptionPicker
                id="pg"
                value={form.gender}
                onChange={(v) => setForm((f) => ({ ...f, gender: v }))}
                options={GENDERS}
                placeholder="Select…"
                ariaLabel="Gender"
              />
            </div>

            {/* Address as its own columns rather than one free-text box. */}
            {/* Suggestions come from the bundled India list; autofill is off so
                the browser's own address guesses do not cover it. */}
            <div className="f">
              <label htmlFor="pst">State</label>
              <input id="pst" list="india-states" value={form.state} onChange={set('state')}
                onBlur={tidyState} autoComplete="off" placeholder="Karnataka" />
            </div>
            <div className="f">
              <label htmlFor="ppin">PIN code</label>
              <input id="ppin" value={form.pincode} onChange={set('pincode')} inputMode="numeric" autoComplete="postal-code" placeholder="560001" />
            </div>
            <div className="f">
              <label htmlFor="pcy">City</label>
              <input id="pcy" list="india-cities" value={form.city} onChange={set('city')}
                onBlur={tidyCity} autoComplete="off" placeholder="Bengaluru" />
            </div>
            <div className="f w">
              <label htmlFor="pa">Address line</label>
              <input id="pa" value={form.address_line} onChange={set('address_line')} autoComplete="address-line1" placeholder="Flat, building, street" />
            </div>

            <datalist id="india-states">
              {STATE_NAMES.map((name) => <option key={name} value={name} />)}
            </datalist>
            <datalist id="india-cities">
              {cityOptions.map((name) => <option key={name} value={name} />)}
            </datalist>
          </form>

          <div className="ce-form-actions">
            <button className="go" type="button" onClick={save} disabled={busy} style={{ margin: 0, padding: '14px 30px' }}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <button className="gh" type="button" onClick={toggleTheme}>Light / dark</button>
            <button className="gh" type="button" onClick={logout} style={{ color: 'var(--er)' }}>Log out</button>
          </div>

          <h2 style={{ fontSize: 26, margin: '34px 0 6px' }}>KYC details</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {kycDone} of {kycDetails.length} details ready — verification checks the same ones.
          </p>
          <div className="panel vs">
            {kycDetails.map((d, i) => (
              <div key={d.key}>
                <i className={d.done ? 'd' : ''}>{d.done ? '✓' : i + 1}</i>
                <div>
                  <h3>{d.label}</h3>
                  <p>{d.text}</p>
                </div>
                {d.done
                  ? <span className="stt">Ready</span>
                  : <button
                    type="button"
                    className="go"
                    onClick={() => (d.go ? nav(d.go) : focusField(d.field))}
                  >
                    {d.go ? 'Verify now' : 'Add'}
                  </button>}
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginTop: 24, padding: 22 }}>
            <h3 style={{ fontSize: 20 }}>Account verification &amp; role</h3>
            <div className="ce-tiles">
              <div className="ce-tile">
                <small>Phone number</small>
                {phoneVerified
                  ? <span className="stt">Verified</span>
                  : <button type="button" className="gh" onClick={() => nav('/verify-otp')}>Verify phone →</button>}
              </div>
              <div className="ce-tile">
                <small>KYC status</small>
                {user?.kyc_status === 'approved'
                  ? <span className="stt">Verified</span>
                  : <button type="button" className="gh" onClick={() => nav('/kyc')}>
                    {user?.kyc_status === 'rejected' ? 'Re-upload KYC →' : 'Complete KYC →'}
                  </button>}
              </div>
              <div className="ce-tile">
                <small>Want to list cars?</small>
                <button
                  type="button"
                  className="gh"
                  onClick={async () => {
                    try {
                      const res = await api('/auth/role-change-request', { method: 'POST', body: { desired_role: 'car_owner' } });
                      toast(res.message || 'Application submitted to Super Admin');
                    } catch (err2) {
                      toast(err2.message || 'Request failed');
                    }
                  }}
                >
                  Apply as Car Owner →
                </button>
              </div>
              <div className="ce-tile">
                <small>Wallet balance</small>
                <b>{user?.wallet_balance_paise != null
                  ? `₹${Math.round(user.wallet_balance_paise / 100).toLocaleString('en-IN')}`
                  : '—'}</b>
                <small className="ce-tile-note">Refunds from cancellations land here</small>
              </div>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
            Signed in as {user?.name || form.name} ({user?.role === 'car_renter' ? 'Customer / Renter' : user?.role})
          </p>
        </>
      )}
    </section>
  );
}
