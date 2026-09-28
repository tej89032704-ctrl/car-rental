import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setSession } from '../api.js';
import '../auth.css';

export default function Login() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [twofaToken, setTwofaToken] = useState('');
  const [err, setErr] = useState('');

  function codeChange(i, val) {
    const n = [...code];
    n[i] = val.slice(-1);
    setCode(n);
    if (val && i < 5) {
      const inp = document.getElementById(`otp-${i + 1}`);
      if (inp) inp.focus();
    }
  }
  function codeBack(i) {
    if (!code[i] && i > 0) {
      const inp = document.getElementById(`otp-${i - 1}`);
      if (inp) inp.focus();
    }
  }

  async function passwordStep(e) {
    e.preventDefault();
    setErr('');
    try {
      const data = await api('/auth/admin/login', { method: 'POST', body: { email, password } });
      if (data.requires_2fa) { setTwofaToken(data.twofa_token); setStep(2); }
      else { setSession(data); nav('/'); }
    } catch (e2) { setErr(e2.message); }
  }

  async function codeStep(e) {
    e.preventDefault();
    const flat = code.join('');
    if (flat.length !== 6) { setErr('Enter all 6 digits'); return; }
    setErr('');
    try {
      const data = await api('/auth/admin/login/verify', { method: 'POST', body: { twofa_token: twofaToken, code: flat } });
      setSession(data);
      nav('/');
    } catch (e2) {
      setErr(e2.message);
      setCode(['', '', '', '', '', '']);
    }
  }

  return (
    <div className="auth-shell admin-login-shell">
      <div className="auth-card-center admin-login-card">
        <div className="admin-login-header">
          <div className="admin-login-logo">CR</div>
          <div>
            <div className="admin-login-brand">ControlRoom</div>
            <div className="admin-login-subtitle">Super Admin Portal</div>
          </div>
        </div>

        <div className="admin-login-dark-card">
          <div className="admin-login-step">
            {step === 1 ? 'Step 1 of 2' : 'Step 2 of 2'}
          </div>
          <h1 className="admin-login-title">
            {step === 1 ? 'Admin sign in' : 'Two-factor check'}
          </h1>
          <p className="admin-login-desc">
            {step === 1
              ? 'Restricted portal. Enter your credentials to continue.'
              : 'A 6-digit code was sent to your registered phone.'}
          </p>

          {err && <div className="alert err">{err}</div>}

          {step === 1 ? (
            <form onSubmit={passwordStep}>
              <div className="field">
                <label className="f admin-login-label">Email</label>
                <input className="f" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@platform.local" required />
              </div>
              <div className="field">
                <label className="f admin-login-label">Password</label>
                <input className="f" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your admin password" required />
              </div>
              <button className="btn btn-full admin-login-btn">
                Continue
              </button>
            </form>
          ) : (
            <form onSubmit={codeStep}>
              <div className="otp-row">
                {code.map((v, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    className="otp-box admin-login-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={v}
                    onChange={(e) => codeChange(i, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Backspace') codeBack(i); }}
                    onFocus={() => { e.target.select(); }}
                  />
                ))}
              </div>
              <button className="btn btn-full admin-login-btn admin-login-btn-otp">
                Verify &amp; sign in
              </button>
              <p className="admin-login-hint">
                Code refreshes every 10 minutes. Check your phone.
              </p>
            </form>
          )}

          <div className="admin-login-footer">
            <p>
              Not receiving codes? The latest SMS is logged in the notification database at<br />
              <code>apps/api/data/notification.db</code><br />
              Query: <code>SELECT body FROM sms_logs ORDER BY created_at DESC LIMIT 1;</code>
            </p>
          </div>
        </div>

        <p className="admin-login-note">
          Direct URL only. Two-factor verification required for all admin actions.
          <br />
          <Link to="/terms" style={{ color: 'inherit', textDecoration: 'underline', opacity: .7 }}>Terms &amp; Conditions</Link>
        </p>
      </div>
    </div>
  );
}
