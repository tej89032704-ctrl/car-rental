import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession, clearSession } from '../api.js';
import { dobBounds } from '../../../../packages/shared/src/ProfileDetails.jsx';

const ROLE_LABEL = { car_renter: 'Renter', car_owner: 'Owner', agent: 'Agent', super_admin: 'Administrator' };
const GENDER_LABEL = {
  female: 'Female', male: 'Male', non_binary: 'Non-binary',
  other: 'Other', prefer_not_to_say: 'Prefer not to say',
};
const KYC_PILL = {
  approved: { label: 'KYC verified', cls: 'active' },
  pending: { label: 'KYC pending', cls: 'pending' },
  rejected: { label: 'KYC rejected', cls: 'rejected' },
};

/**
 * One account, three things people come here for: who am I, is my KYC done,
 * and how do I fix my details. /auth/me is the source of truth rather than the
 * cached localStorage copy, because the cached one goes stale the moment
 * another device edits the same account.
 */
export default function Profile() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  // Profile details beyond the auth essentials: collected at signup by
  // /profile-details, editable here like any other profile field.
  const [details, setDetails] = useState({
    date_of_birth: '', gender: '', address_line: '', city: '', state: '', pincode: '',
  });
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [subs, setSubs] = useState([]);
  const [subsErr, setSubsErr] = useState('');

  useEffect(() => {
    api('/auth/me')
      .then((d) => {
        setMe(d.user);
        setForm({ name: d.user.name || '', phone: d.user.phone || '' });
        setDetails({
          date_of_birth: d.user.date_of_birth || '',
          gender: d.user.gender || '',
          address_line: d.user.address_line || '',
          city: d.user.city || '',
          state: d.user.state || '',
          pincode: d.user.pincode || '',
        });
      })
      .catch((e) => setErr(e.message));
    
    // Load subscription data
    api('/subscriptions/mine')
      .then((data) => {
        setSubs(data || []);
        setSubsErr('');
      })
      .catch((e) => {
        setSubs([]); // Empty array on error
        setSubsErr(e.message);
      });
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setSaved('');
    try {
      const d = await api('/auth/me', { method: 'PATCH', body: { ...form, ...details } });
      setMe(d.user);
      // The sidebar polls localStorage every 500ms, so this re-renders it too.
      setSession({ user: d.user });
      setSaved(d.changed ? 'Profile updated.' : 'No changes to save.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const kyc = KYC_PILL[me?.kyc_status] || KYC_PILL.pending;

  return (
    <>
      <div className="page-header">
        <h1>Profile</h1>
        <p className="subtitle">Your account details, verification status and contact information</p>
      </div>

      {err && <div className="alert err">{err}</div>}

      <section className="card">
        {!me && !err && <p className="muted">Loading…</p>}
        {me && (
          <>
            <div className="profile-head">
              <div className="profile-avatar">{me.name?.[0] || 'U'}</div>
              <div className="profile-id">
                <h2>{me.name}</h2>
                <p className="muted">{ROLE_LABEL[me.role] || me.role}</p>
              </div>
              <span className={`pill ${kyc.cls}`}>{kyc.label}</span>
            </div>

            <dl className="profile-details">
              <div className="info-row"><dt className="info-label">Email</dt><dd className="info-value">{me.email}</dd></div>
              <div className="info-row"><dt className="info-label">Phone</dt><dd className="info-value">{me.phone || '—'}</dd></div>
              <div className="info-row"><dt className="info-label">Age</dt><dd className="info-value">{me.age ?? '—'}</dd></div>
              <div className="info-row"><dt className="info-label">Gender</dt><dd className="info-value">{GENDER_LABEL[me.gender] || '—'}</dd></div>
              <div className="info-row"><dt className="info-label">Location</dt><dd className="info-value">{[me.city, me.state].filter(Boolean).join(', ') || '—'}</dd></div>
              <div className="info-row"><dt className="info-label">Role</dt><dd className="info-value">{ROLE_LABEL[me.role] || me.role}</dd></div>
              <div className="info-row"><dt className="info-label">Account status</dt><dd className="info-value">{String(me.status || '').replace(/_/g, ' ')}</dd></div>
            </dl>

            {me.kyc_status !== 'approved' && (
              <div className="alert info">
                Verification is still outstanding — you can manage this account, but listing a car needs
                an approved KYC. <Link to="/kyc">Go to Verification</Link>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Edit details</h2>
        {saved && <div className="alert good">{saved}</div>}
        <form onSubmit={save}>
          <div className="row">
            <div className="form-group">
              <label className="f" htmlFor="pf-name">Full name</label>
              <input id="pf-name" className="f" value={form.name} required minLength={2} maxLength={120}
                placeholder="Your full name"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="f" htmlFor="pf-phone">Phone</label>
              <input id="pf-phone" className="f" value={form.phone} required
                pattern="^\+?[0-9]{10,14}$" title="10-14 digits, optional leading +"
                placeholder="+91 98765 43210"
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="form-group">
              <label className="f" htmlFor="pf-dob">Date of birth</label>
              <input id="pf-dob" className="f" type="date" required
                min={dobBounds().min} max={dobBounds().max}
                value={details.date_of_birth}
                onChange={(e) => setDetails({ ...details, date_of_birth: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="f" htmlFor="pf-gender">Gender</label>
              <select id="pf-gender" className="f" value={details.gender}
                onChange={(e) => setDetails({ ...details, gender: e.target.value })}>
                <option value="">Prefer not to say</option>
                {Object.entries(GENDER_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="f" htmlFor="pf-address">Address</label>
            <input id="pf-address" className="f" value={details.address_line}
              placeholder="Flat / street"
              onChange={(e) => setDetails({ ...details, address_line: e.target.value })} />
          </div>
          <div className="row">
            <div className="form-group">
              <label className="f" htmlFor="pf-city">City</label>
              <input id="pf-city" className="f" value={details.city}
                onChange={(e) => setDetails({ ...details, city: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="f" htmlFor="pf-state">State</label>
              <input id="pf-state" className="f" value={details.state}
                onChange={(e) => setDetails({ ...details, state: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="f" htmlFor="pf-pincode">PIN code</label>
              <input id="pf-pincode" className="f" value={details.pincode} inputMode="numeric"
                pattern="\d{4,10}"
                onChange={(e) => setDetails({ ...details, pincode: e.target.value })} />
            </div>
          </div>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          <p className="form-hint">Your email is your sign-in ID and can't be changed here.</p>
        </form>
      </section>

      <section className="card">
        <h2>Session</h2>
        <p className="muted">You're signed in on this device. Signing out clears the local session.</p>
        <div className="action-bar">
          <Link to="/kyc" className="btn sec">Verification</Link>
          <button className="btn" onClick={() => { clearSession(); nav('/login'); }}>Sign out</button>
        </div>
      </section>

      {/* Optional chaining, not me.status: `me` is null on the first render
          (before /auth/me resolves) and this sits outside the {me && ...}
          guard above, so a bare property read crashed the whole page. */}
      {me?.status !== 'active' ? (
        <section className="card">
          <h2>Subscription</h2>
          <div className="alert info">
            Please verify your mobile number to view and manage your subscription.
            <br />
            <small>Verification is required to access subscription features.</small>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Subscription</h2>
          {subsErr && <div className="alert err">{subsErr}</div>}
          {!subsErr && subs.length === 0 && (
            <p className="muted">No active subscription. <Link to="/earnings">Subscribe now</Link></p>
          )}
          {!subsErr && subs.length > 0 && (
            <>
              <div className="stat-grid">
                {subs.map((sub, index) => (
                  <div key={index} className="stat-card">
                    <div className="stat-value">{sub.plan === 'car_owner_monthly' ? '₹100/month' : sub.plan === 'renter_lifetime' ? 'Lifetime' : sub.plan}</div>
                    <div className="stat-label">{sub.plan === 'car_owner_monthly' ? 'Monthly Subscription' : sub.plan === 'renter_lifetime' ? 'Lifetime Membership' : 'Subscription Plan'}</div>
                    <div className="stat-value" style={{ fontSize: '0.875rem' }}>{sub.status === 'active' ? 'Active' : sub.status}</div>
                    <div className="stat-label">Status</div>
                  </div>
                ))}
              </div>
              {subs.some((s) => s.status === 'active') && (
                <div className="mt-8">
                  <p className="muted">Your subscription is active. Manage it in the <Link to="/owner-web/">Owner Portal</Link> if you're a car owner.</p>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}