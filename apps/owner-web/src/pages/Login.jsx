import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import '../auth.css';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      setSession(data);
      nav('/', { state: { role: 'car_owner' } });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-wrap">
        {/* ── Left brand panel ── */}
        <div className="auth-visual">
          <div className="mark">OwnerHub</div>
          <p className="tagline">List your car. Earn from every rental.<br />Manage bookings, earnings, and payouts — all in one place.</p>
          <div className="badges">
            <div className="badge">✓ ₹100/month subscription</div>
            <div className="badge">✓ 80% cash at pickup</div>
            <div className="badge">✓ Earn reports</div>
            <div className="badge">✓ KYC verified</div>
          </div>
        </div>
        {/* ── Right form panel ── */}
        <div className="auth-form-side">
          <div className="portal-tag">Owner portal</div>
          <h1>Owner sign in</h1>
          <p className="sub">Welcome back — manage your fleet and bookings.</p>
          {err && <div className="alert err" style={{marginBottom:14}}>{err}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <label className="f">Email</label>
              <input className="f" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="field">
              <label className="f">Password</label>
              <input className="f" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} />
            </div>
            <button className="btn btn-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="footer-links">
            <div>
              New here?{' '}
              <Link to="/signup" style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 14 }}>Create owner account</Link>
            </div>
            <div style={{ marginTop: 8 }}>
              <Link to="/forgot-password" style={{ color: 'var(--muted)', fontSize: 13 }}>Forgot password?</Link>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              By continuing you agree to our{' '}
              <Link to="/terms" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>Terms &amp; Conditions</Link>.
            </div>
          </div>
          <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
            Owner sign-up also works from the renter portal. Your account type stays car_owner.
          </p>
        </div>
      </div>
    </div>
  );
}
