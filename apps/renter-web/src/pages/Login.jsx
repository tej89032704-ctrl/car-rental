import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';
import '../auth.css';

export default function Login() {
  const nav = useNavigate();
  const [role, setRole] = useState('car_renter');
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
      nav('/', { state: { role } });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-wrap">
        {/* ── Left brand panel ── */}
        <div className="auth-visual">
          <div className="mark">DriveNow</div>
          <p className="tagline">Rent a car in minutes.<br />Book from verified owners. Pay 20% online, the rest at pickup.</p>
          <div className="badges">
            <div className="badge">✓ Verified owners</div>
            <div className="badge">✓ 20% online now</div>
            <div className="badge">✓ Cash at pickup</div>
            <div className="badge">✓ 24/7 support</div>
          </div>
        </div>
        {/* ── Right form panel ── */}
        <div className="auth-form-side">
          <div className="portal-tag">Customer portal</div>
          <h1>Welcome back</h1>
          <p className="sub">Sign in to rent or manage your bookings.</p>
          {err && <div className="alert err" style={{marginBottom:14}}>{err}</div>}
          {/* Role toggle */}
          <div className="role-pills">
            <div className={`role-pill${role === 'car_renter' ? ' on' : ''}`} onClick={() => setRole('car_renter')}>
              🚗 Rent a car
            </div>
            <div className={`role-pill${role === 'car_owner' ? ' on' : ''}`} onClick={() => setRole('car_owner')}>
              📋 List my car
            </div>
          </div>
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
              <Link to="/signup" style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 14 }}>Create an account</Link>
            </div>
            <div style={{ marginTop: 8 }}>
              <Link to="/forgot-password" style={{ color: 'var(--muted)', fontSize: 13 }}>Forgot password?</Link>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
            Agents & admins have separate portals.
          </p>
        </div>
      </div>
    </div>
  );
}
