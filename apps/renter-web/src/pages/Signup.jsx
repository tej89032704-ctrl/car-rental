import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import '../auth.css';

export default function Signup() {
  const nav = useNavigate();
  const [role, setRole] = useState('car_renter');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const data = await api('/auth/signup', { method: 'POST', body: { ...f, role } });
      const session = await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } });
      setSession(session);
      nav('/verify-otp', { state: { devOtp: data.dev_otp, role } });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-wrap">
        {/* ── Left brand panel ── */}
        <div className="auth-visual">
          <div className="mark">CAR-ENT</div>
          <p className="tagline">Join thousands of renters and car owners on the easiest way to rent.</p>
          <div className="badges">
            <div className="badge">✓ No commission</div>
            <div className="badge">✓ Verified owners</div>
            <div className="badge">✓ 20% online now</div>
            <div className="badge">✓ Cash at pickup</div>
          </div>
        </div>
        {/* ── Right form panel ── */}
        <div className="auth-form-side">
          <div className="portal-tag">Create account</div>
          <h1>Join CAR-ENT</h1>
          <p className="sub">Pick how you want to use the platform.</p>
          {err && <div className="alert err" style={{marginBottom:14}}>{err}</div>}
          {/* Role picker */}
          <div className="role-pills">
            <div className={`role-pill${role === 'car_renter' ? ' on' : ''}`} onClick={() => setRole('car_renter')}>
              🚗 I want to rent cars
            </div>
            <div className={`role-pill${role === 'car_owner' ? ' on' : ''}`} onClick={() => setRole('car_owner')}>
              📋 I want to list my car
            </div>
          </div>
          <form onSubmit={submit}>
            <div className="field">
              <label className="f">Full name</label>
              <input className="f" value={f.name} onChange={set('name')} placeholder="Your full name" required minLength={2} />
            </div>
            <div className="field">
              <label className="f">Email</label>
              <input className="f" type="email" value={f.email} onChange={set('email')} placeholder="you@example.com" required />
            </div>
            <div className="field">
              <label className="f">Phone</label>
              <input className="f" value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" required />
            </div>
            <div className="field">
              <label className="f">Password</label>
              <input className="f" type="password" value={f.password} onChange={set('password')} placeholder="Min 8 characters" required minLength={8} />
            </div>
            <button className="btn btn-full" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <div className="footer-links">
            <div>
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 14 }}>Sign in</Link>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              By creating an account you agree to our{' '}
              <Link to="/terms" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>Terms &amp; Conditions</Link>.
            </div>
          </div>
          <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
            You'll verify your phone number next. Your role can't be changed later — contact Super Admin if needed.
          </p>
        </div>
      </div>
    </div>
  );
}
