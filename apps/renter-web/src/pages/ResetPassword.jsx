import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import '../auth.css';

export default function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg(''); setBusy(true);
    try {
      const r = await api('/auth/reset-password', { method: 'POST', body: { token, new_password: password } });
      setOk(true); setMsg(r.message);
    } catch (e2) { setMsg(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card-center">
        <div className="portal-tag">Customer portal</div>
        <h1>Set a new password</h1>
        <p className="sub">Use the reset token from your email.</p>
        {msg && (
          <div className={`alert ${ok ? 'good' : 'err'}`} style={{ marginBottom: 16 }}>
            {msg}
          </div>
        )}
        {!ok && (
          <form onSubmit={submit}>
            <div className="field">
              <label className="f">Reset token</label>
              <input className="f" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the token from email" required />
            </div>
            <div className="field">
              <label className="f">New password</label>
              <input className="f" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} />
            </div>
            <button className="btn btn-full" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
        {!ok && (
          <div className="footer-links" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 14 }}>Back to sign in</Link>
          </div>
        )}
      </div>
    </div>
  );
}
