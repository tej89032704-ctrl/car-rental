import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import '../auth.css';

export default function Signup() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const data = await api('/auth/signup', { method: 'POST', body: { ...f, role: 'car_owner' } });
      const session = await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } });
      setSession(session);
      nav('/verify-otp', { state: { devOtp: data.dev_otp } });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-wrap">
        <div className="auth-visual">
          <div className="mark">OwnerHub</div>
          <p className="tagline">Start earning from your car today.<br />List, manage, and get paid — all in one place.</p>
          <div className="badges">
            <div className="badge">✓ Easy listing</div>
            <div className="badge">✓ Secure payouts</div>
            <div className="badge">✓ KYC verified</div>
            <div className="badge">✓ 24/7 support</div>
          </div>
        </div>
        <div className="auth-form-side">
          <div className="portal-tag">Owner portal</div>
          <h1>Create owner account</h1>
          <p className="sub">List your car and start earning from rentals.</p>
          {err && <div className="alert err">{err}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <label className="f">Full name</label>
              <input className="f" value={f.name} onChange={set('name')} required minLength={2} placeholder="Your full name" />
            </div>
            <div className="field">
              <label className="f">Email</label>
              <input className="f" type="email" value={f.email} onChange={set('email')} required placeholder="you@example.com" />
            </div>
            <div className="field">
              <label className="f">Phone</label>
              <input className="f" value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" required />
            </div>
            <div className="field">
              <label className="f">Password</label>
              <input className="f" type="password" value={f.password} onChange={set('password')} placeholder="Min 8 characters" required minLength={8} />
            </div>
            <button className="btn btn-full" disabled={busy} style={{ width: '100%', marginTop: 6, padding: 13, fontSize: 15, fontWeight: 700, borderRadius: 12, background: 'linear-gradient(135deg, #1CA9A3, #128F8A)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {busy ? 'Creating account...' : 'Create owner account'}
            </button>
          </form>
          <div className="footer-links" style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13 }}>
              Already registered?{' '}
              <Link to="/login" style={{ color: '#1CA9A3', fontWeight: 700 }}>Sign in</Link>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
            You'll be redirected to verify your phone number. Your account type stays car_owner.
          </p>
        </div>
      </div>
    </div>
  );
}
