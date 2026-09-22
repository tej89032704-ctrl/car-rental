import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import '../auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [devToken, setDevToken] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg(''); setBusy(true);
    try {
      const r = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setMsg(r.message);
      if (r.dev_token) setDevToken(r.dev_token);
    } catch (e2) { setMsg(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card-center">
        <div className="portal-tag">Customer portal</div>
        <h1>Forgot password?</h1>
        <p className="sub">No worries — we'll send a reset link to your email.</p>
        {msg && (
          <div className="alert info" style={{ marginBottom: 16 }}>
            {msg}
            {devToken && <><br /><span style={{ fontSize: 12 }}>Dev token: <b>{devToken}</b></span></>}
          </div>
        )}
        <form onSubmit={submit}>
          <div className="field">
            <label className="f">Account email</label>
            <input className="f" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <button className="btn btn-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <div className="footer-links" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 14 }}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
