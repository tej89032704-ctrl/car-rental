import { useEffect, useRef, useState } from 'react';

export default function App() {
  const [isRegister, setIsRegister] = useState(false);
  const [currentRole, setCurrentRole] = useState('pick');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const btnPickRef = useRef(null);
  const btnGiveRef = useRef(null);
  const loginTitleRef = useRef(null);
  const loginSubRef = useRef(null);
  const btnTextRef = useRef(null);

  const API =
    import.meta.env.VITE_API_URL ||
    (window.location.port === '5173' ? 'http://localhost:8081/api/auth' : '/api/auth');

  useEffect(() => {
    updateUI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRegister, currentRole]);

  function updateUI() {
    const isPick = currentRole === 'pick';
    if (isRegister) {
      if (loginTitleRef.current) loginTitleRef.current.textContent = 'Create your account.';
      if (loginSubRef.current)
        loginSubRef.current.textContent = isPick
          ? 'Rent cars for free. No credit card needed.'
          : 'Start earning with your car.';
      if (btnTextRef.current)
        btnTextRef.current.textContent = isPick ? 'Create account' : 'Register as owner';
    } else {
      if (loginTitleRef.current) loginTitleRef.current.textContent = 'Welcome back.';
      if (loginSubRef.current) loginSubRef.current.textContent = 'Sign in to continue.';
      if (btnTextRef.current) btnTextRef.current.textContent = 'Continue';
    }
  }

  function setRole(role) {
    setCurrentRole(role);
    const isPick = role === 'pick';
    btnPickRef.current?.classList.toggle('is-active', isPick);
    btnGiveRef.current?.classList.toggle('is-active', !isPick);
  }

  function toggleMode(e) {
    e.preventDefault();
    setIsRegister((r) => !r);
    setErrorMsg('');
  }

  async function handleSubmit() {
    setErrorMsg('');
    const n = nameRef.current?.value.trim() || '';
    const e = emailRef.current?.value.trim() || '';
    const p = passwordRef.current?.value.trim() || '';
    if (!e || !p || (isRegister && !n)) {
      setErrorMsg('Please fill in all fields.');
      return;
    }
    if (!e.includes('@')) {
      setErrorMsg('Enter a valid email.');
      return;
    }
    if (p.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    if (btnTextRef.current)
      btnTextRef.current.textContent = isRegister ? 'Creating account…' : 'Signing in…';
    try {
      const endpoint = isRegister ? `${API}/register` : `${API}/login`;
      const role = currentRole === 'pick' ? 'customer' : 'owner';
      const body = isRegister
        ? { name: n, email: e, password: p, role }
        : { email: e, password: p, role };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || 'Something went wrong.');
        setSubmitting(false);
        updateUI();
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data));
      window.location.href =
        data.role === 'owner' ? 'owner-dashboard.html' : 'customer-dashboard.html';
    } catch (_) {
      setErrorMsg('Cannot connect to server.');
      setSubmitting(false);
      updateUI();
    }
  }

  function handleGoogle(r) {
    setErrorMsg('');
    setSubmitting(true);
    if (btnTextRef.current) btnTextRef.current.textContent = 'Signing in…';
    const role = currentRole === 'pick' ? 'customer' : 'owner';
    fetch(`${API}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: r.credential, role }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) {
          setErrorMsg(data?.message || 'Google sign-in failed.');
          setSubmitting(false);
          updateUI();
          return;
        }
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data));
        window.location.href =
          data.role === 'owner' ? 'owner-dashboard.html' : 'customer-dashboard.html';
      })
      .catch(() => {
        setErrorMsg('Cannot connect to server.');
        setSubmitting(false);
        updateUI();
      });
  }

  function googleClick() {
    window.google.accounts.id.initialize({
      client_id: '968585560679-k9f6mnvmd9lkb1s74lbikilotnvb5tgg.apps.googleusercontent.com',
      callback: handleGoogle,
    });
    window.google.accounts.id.prompt();
  }

  return (
    <>
      <nav>
        <div className="nav-logo">
          CAR<span>-</span>ENT
        </div>
        <div className="nav-links">
          <a href="#pricing">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#support">Support</a>
          <a href="#login" className="nav-cta" id="navCta">
            Sign in
          </a>
        </div>
      </nav>

      <section className="hero">
        <h1>Cars, on demand.</h1>
        <p>Rent verified cars from real owners. Or list yours and earn. No middlemen. No markups.</p>
        <a href="#login" className="hero-cta">
          Get started
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </section>

      <section className="pricing" id="pricing">
        <div className="pricing-card pricing-card--accent">
          <div className="label">Renters</div>
          <div className="amount">₹0</div>
          <div className="period">Free, always</div>
          <div className="note">Browse, book, and drive. No subscription. No hidden fees.</div>
        </div>
        <div className="pricing-card pricing-card--dark">
          <div className="label">Car Owners</div>
          <div className="amount">₹100</div>
          <div className="period">per month</div>
          <div className="note">List your car, earn on your schedule. We handle bookings &amp; payments.</div>
        </div>
      </section>

      <div className="divider-line" />

      <section className="login-section" id="login">
        <div className="login-box">
          <h2 ref={loginTitleRef}>Welcome back.</h2>
          <p className="sub" ref={loginSubRef}>
            Sign in to continue.
          </p>

          <div className="role-row">
            <button type="button" className="role-btn is-active" id="btnPick" ref={btnPickRef} onClick={() => setRole('pick')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
              Rent a car
            </button>
            <button type="button" className="role-btn" id="btnGive" ref={btnGiveRef} onClick={() => setRole('give')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" />
                <path d="M7 8l5-5 5 5" />
                <rect x="4" y="15" width="16" height="6" rx="1.5" />
              </svg>
              List your car
            </button>
          </div>

          <div className="input-group" style={{ display: isRegister ? 'block' : 'none' }}>
            <input id="name" ref={nameRef} type="text" placeholder="Full name" autoComplete="name" />
          </div>
          <div className="input-group">
            <input id="email" ref={emailRef} type="email" placeholder="Email" autoComplete="email" />
          </div>
          <div className="input-group">
            <input id="password" ref={passwordRef} type="password" placeholder="Password" autoComplete="current-password" />
          </div>

          <button type="button" className="submit-btn" id="signinBtn" disabled={submitting} onClick={handleSubmit}>
            <span ref={btnTextRef}>Continue</span>
          </button>

          <div className="or-divider">or</div>

          <button type="button" className="google-btn" id="googleBtn" disabled={submitting} onClick={googleClick}>
            <svg viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6 29.5 4 24 4c-7.4 0-13.8 4.2-17 10.3z" />
              <path fill="#4CAF50" d="M24 44c5.4 0 10.3-1.8 14.1-5l-6.5-5.3C29.5 35.4 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.9 39.6 16.4 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.3C40.9 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
            </svg>
            Continue with Google
          </button>

          <div className="login-foot">
            Don't have an account?{' '}
            <a href="#" id="toggleLink" onClick={toggleMode}>
              {isRegister ? 'Sign in' : 'Create one'}
            </a>
          </div>
          <div className="error-msg" id="errorMsg" role="alert" aria-live="polite">
            {errorMsg}
          </div>
        </div>
      </section>

      <footer>
        <div>Copyright © 2026 CAR-ENT. All rights reserved.</div>
        <div className="footer-links">
          <a href="#pricing">Privacy</a>
          <a href="#support">Terms</a>
          <a href="#login">Sitemap</a>
        </div>
      </footer>
    </>
  );
}
