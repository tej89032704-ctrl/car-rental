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
      const data = await api('/auth/agent/login', { method: 'POST', body: { email, password } });
      setSession(data);
      nav('/');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-wrap">
        {/* ── Left brand panel ── */}
        <div className="auth-visual agent-gradient">
          <div className="mark">AgentField</div>
          <p className="tagline">Field operations &amp; customer support.<br />On the ground, in the app.</p>
          <div className="badges">
            <div className="badge">✓ Salaried staff</div>
            <div className="badge">✓ No commission</div>
            <div className="badge">✓ Lead management</div>
            <div className="badge">✓ Issue resolution</div>
          </div>
        </div>
        {/* ── Right form panel ── */}
        <div className="auth-form-side">
          <div className="portal-tag agent">Agent portal</div>
          <h1>Agent sign in</h1>
          <p className="sub">Welcome back to the field team.</p>
          {err && <div className="alert err">{err}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <label className="f">Email</label>
              <input className="f" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div className="field">
              <label className="f">Password</label>
              <input className="f" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your agent password" required minLength={8} />
            </div>
            <button className="btn btn-full agent-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="footer-links agent-footer">
            <div className="link-row">
              New agent?{' '}
              <Link to="/signup">Create agent account</Link>
            </div>
            <div className="link-row">
              Already registered?{' '}
              <Link to="/agent/login">Sign in</Link>
            </div>
          </div>
          <p className="muted agent-note">
            Agents are salaried field staff — separate from the public app. Contact Super Admin to set up your account.
          </p>
        </div>
      </div>
    </div>
  );
}
