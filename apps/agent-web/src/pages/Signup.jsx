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
      const data = await api('/auth/signup', { method: 'POST', body: { ...f, role: 'agent' } });
      const session = await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } });
      setSession(session);
      nav('/verify-otp', { state: { devOtp: data.dev_otp } });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-wrap">
        <div className="auth-visual agent-gradient">
          <div className="mark">AgentField</div>
          <p className="tagline">Join the field team. Handle customer support, issue resolution, and on-ground operations.</p>
          <div className="badges">
            <div className="badge">✓ Salaried staff</div>
            <div className="badge">✓ No commission</div>
            <div className="badge">✓ Lead management</div>
            <div className="badge">✓ Issue resolution</div>
          </div>
        </div>
        <div className="auth-form-side">
          <div className="portal-tag agent">Agent portal</div>
          <h1>Become an agent</h1>
          <p className="sub">Field ops, issue handling & customer support — salaried, no commission.</p>
          {err && <div className="alert err">{err}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <label className="f">Full name</label>
              <input className="f" value={f.name} onChange={set('name')} required minLength={2} placeholder="Your full name" />
            </div>
            <div className="field">
              <label className="f">Email</label>
              <input className="f" type="email" value={f.email} onChange={set('email')} required placeholder="you@company.com" />
            </div>
            <div className="field">
              <label className="f">Phone</label>
              <input className="f" value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" required />
            </div>
            <div className="field">
              <label className="f">Password</label>
              <input className="f" type="password" value={f.password} onChange={set('password')} placeholder="Min 8 characters" required minLength={8} />
            </div>
            <button className="btn btn-full agent-full" disabled={busy} style={{ width: '100%', marginTop: 6, padding: 13, fontSize: 15, fontWeight: 700, borderRadius: 12, background: 'linear-gradient(135deg, #000000, #1d1d1f)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {busy ? 'Creating account...' : 'Create agent account'}
            </button>
          </form>
          <div className="footer-links agent-footer" style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #e8e8ed' }}>
            <div className="link-row" style={{ fontSize: 13, marginBottom: 6 }}>
              Already registered?{' '}
              <Link to="/agent/login" style={{ color: '#1d1d1f', fontWeight: 700 }}>Sign in</Link>
            </div>
            <div className="link-row" style={{ fontSize: 12, marginTop: 8 }}>
              By creating an account you agree to our{' '}
              <Link to="/terms" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>Terms &amp; Conditions</Link>.
            </div>
          </div>
          <p className="muted agent-note" style={{ marginTop: 14, fontSize: 12 }}>
            Agents are salaried field staff — separate from the public app. Contact Super Admin to set up your account.
          </p>
        </div>
      </div>
    </div>
  );
}
