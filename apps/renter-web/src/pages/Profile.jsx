import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearSession, setSession } from '../api.js';
import { applyTheme, isDark, toast } from '../components/ui.js';

export default function Profile() {
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '', address_line: '' });
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
          city: u.city || '',
          address_line: u.address_line || '',
        });
        setErr('');
      })
      .catch((e) => setErr(e.message || 'Could not load your profile'))
      .finally(() => setLoading(false));
  }, []);

  async function save(e) {
    e.preventDefault();
    if (form.name.trim().length < 2) { setErr('Name is required'); return; }
    if (!/^\+?[0-9]{10,14}$/.test(form.phone.replace(/[\s().-]/g, ''))) {
      setErr('Enter a phone number we can reach you on');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const body = { name: form.name.trim(), phone: form.phone.replace(/[\s().-]/g, '') };
      if (form.city.trim()) body.city = form.city.trim();
      if (form.address_line.trim()) body.address_line = form.address_line.trim();
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

  return (
    <section className="pg">
      <div className="hd">
        <div>
          <h1>Profile</h1>
          <p>Up-to-date details mean faster bookings.</p>
        </div>
      </div>

      {err && <div className="ce-err">{err}</div>}
      {loading && !err && <div className="ce-load"><span className="spinner" /><span>Loading your profile…</span></div>}

      {!loading && (
        <>
          <form className="panel fm" onSubmit={save}>
            <div className="f">
              <label htmlFor="pn">Full name</label>
              <input id="pn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            </div>
            <div className="f">
              <label htmlFor="pe">Email</label>
              <input id="pe" value={form.email} readOnly title="Email cannot be changed here" />
            </div>
            <div className="f">
              <label htmlFor="pp">Phone</label>
              <input id="pp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" autoComplete="tel" />
            </div>
            <div className="f">
              <label htmlFor="pc">City</label>
              <input id="pc" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} autoComplete="address-level2" />
            </div>
            <div className="f w">
              <label htmlFor="pa">Address</label>
              <textarea id="pa" value={form.address_line} onChange={(e) => setForm({ ...form, address_line: e.target.value })} autoComplete="street-address" />
            </div>
          </form>

          <div className="ce-form-actions">
            <button className="go" type="button" onClick={save} disabled={busy} style={{ margin: 0, padding: '14px 30px' }}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <button className="gh" type="button" onClick={toggleTheme}>Light / dark</button>
            <button className="gh" type="button" onClick={logout} style={{ color: 'var(--er)' }}>Log out</button>
          </div>

          <div className="panel" style={{ marginTop: 24, padding: 22 }}>
            <h3 style={{ fontSize: 20 }}>Account verification &amp; role</h3>
            <div className="ce-tiles">
              <div className="ce-tile">
                <small>Phone number</small>
                {user?.phone_verified_at
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
