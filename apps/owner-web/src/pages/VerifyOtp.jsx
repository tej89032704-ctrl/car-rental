import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

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
    <div className="auth-box card">
      <h1>Verify your phone</h1>
      <p className="muted">Enter the 6-digit code we sent you.</p>
      {state?.devOtp && <div className="alert info">Dev mode OTP: <b>{state.devOtp}</b></div>}
      {info && <div className="alert info">{info}</div>}
      {err && <div className="alert err">{err}</div>}
      <form onSubmit={submit}>
        <label className="f">Code</label>
        <input className="f" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6}
          inputMode="numeric" autoComplete="one-time-code" required />
        <br /><br />
        <button className="btn" style={{ width: '100%' }}>Verify</button>
      </form>
      <p style={{ marginTop: 12 }}><button className="btn sec sm" onClick={resend}>Resend OTP</button></p>
    </div>
  );
}
