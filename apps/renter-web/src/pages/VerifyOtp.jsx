import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import '../auth.css';

export default function VerifyOtp() {
  const { state } = useLocation();
  const nav = useNavigate();
  const [code, setCode] = useState(state?.devOtp || '');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/auth/otp/phone/verify', { method: 'POST', body: { code } });
      // Phone is confirmed, so collect the remaining profile details before
      // KYC: verification is the step that actually blocks bookings, and it is
      // easier to ask for demographics once, in context, than later.
      nav('/profile-details');
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
        <div className="portal-tag">Phone Verification</div>
        <h1>Verify your phone</h1>
        <p className="sub">Enter the 6-digit code we sent you.</p>
        {state?.devOtp && <div className="alert info">Dev mode OTP: <b>{state.devOtp}</b></div>}
        {info && <div className="alert info">{info}</div>}
        {err && <div className="alert err">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label className="f">Verification code</label>
            <input className="f" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6}
              inputMode="numeric" autoComplete="one-time-code" required placeholder="000000"
              style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, letterSpacing: 6 }} />
          </div>
          <button className="btn btn-full">Verify</button>
        </form>
        <p style={{ marginTop: 16, textAlign: 'center' }}>
          <button onClick={resend} style={{ background: 'none', border: 'none', color: 'var(--acc-text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: '8px 16px', borderRadius: 8, transition: 'background 0.2s' }} onMouseEnter={e => e.target.style.background = 'var(--acc-soft)'} onMouseLeave={e => e.target.style.background = 'none'}>Resend OTP</button>
        </p>
      </div>
    </div>
  );
}
