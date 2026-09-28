import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import '../auth.css';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [devToken, setDevToken] = useState('');

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    try {
      const r = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setMsg(r.message);
      if (r.dev_token) setDevToken(r.dev_token);
    } catch (e2) { setMsg(e2.message); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card-center">
        <div className="portal-tag">Password Recovery</div>
        <h1>Forgot password</h1>
        <p className="sub">Enter your email and we'll send you a reset link.</p>
        {msg && <div className="alert info">{msg}{devToken && <> Dev token: <b>{devToken}</b></>}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label className="f">Account email</label>
            <input className="f" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <button className="btn btn-full" style={{ width: '100%', marginTop: 6, padding: 13, fontSize: 15, fontWeight: 700, borderRadius: 12, background: 'linear-gradient(135deg, #000000, #1d1d1f)', color: '#fff', border: 'none', cursor: 'pointer' }}>Send reset link</button>
        </form>
        <p className="muted" style={{ marginTop: 18, fontSize: 13 }}><Link to="/login" style={{ color: '#1d1d1f', fontWeight: 700 }}>Back to login</Link></p>
      </div>
    </div>
  );
}

export function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    try {
      const r = await api('/auth/reset-password', { method: 'POST', body: { token, new_password: password } });
      setOk(true); setMsg(r.message);
    } catch (e2) { setMsg(e2.message); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card-center">
        <div className="portal-tag">Reset Password</div>
        <h1>Set a new password</h1>
        <p className="sub">Enter your reset token and choose a new password.</p>
        {msg && <div className={`alert ${ok ? 'info' : 'err'}`}>{msg}</div>}
        {!ok && (
          <form onSubmit={submit}>
            <div className="field">
              <label className="f">Reset token</label>
              <input className="f" value={token} onChange={(e) => setToken(e.target.value)} required placeholder="Paste your token" />
            </div>
            <div className="field">
              <label className="f">New password (min 8 chars)</label>
              <input className="f" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required placeholder="Enter new password" />
            </div>
            <button className="btn btn-full" style={{ width: '100%', marginTop: 6, padding: 13, fontSize: 15, fontWeight: 700, borderRadius: 12, background: 'linear-gradient(135deg, #000000, #1d1d1f)', color: '#fff', border: 'none', cursor: 'pointer' }}>Update password</button>
          </form>
        )}
        <p className="muted" style={{ marginTop: 18, fontSize: 13 }}><Link to="/login" style={{ color: '#1d1d1f', fontWeight: 700 }}>Back to login</Link></p>
      </div>
    </div>
  );
}
