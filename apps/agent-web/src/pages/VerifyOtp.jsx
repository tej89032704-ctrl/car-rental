import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import '../auth.css';

export default function VerifyOtp() {
  const { state } = useLocation();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/auth/otp/phone/verify', { method: 'POST', body: { code } });
      nav('/');
    } catch (e2) { setErr(e2.message); }
  }

  async function resend() {
    try {
      const r = await api('/auth/otp/phone/request', { method: 'POST' });
      setInfo(r.dev_otp ? `Dev OTP: ${r.dev_otp}` : 'OTP sent again');
    } catch (e2) { setInfo(e2.message); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card-center">
        <div className="portal-tag agent">Agent portal</div>
        <h1>Verify your phone</h1>
        <p className="sub">Enter the 6-digit code we sent to your phone.</p>
        {state?.devOtp && <div className="alert info">Dev mode OTP: <b>{state.devOtp}</b></div>}
        {info && <div className="alert info">{info}</div>}
        {err && <div className="alert err">{err}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="f">Verification code</label>
            <input className="f" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required placeholder="6 digits" />
          </div>
          <br />
          <button className="btn btn-full">Verify &amp; sign in</button>
        </form>
        <p className="action-bar-center">
          <button className="btn sec sm" onClick={resend}>Resend OTP</button>
        </p>
        <p className="muted agent-note text-center">
          Agent accounts are created by Super Admin. You'll be redirected to your dashboard after verification.
        </p>
      </div>
    </div>
  );
}
