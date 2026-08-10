import { useEffect, useRef, useState } from 'react';

/* ===== WebGL-style dot-matrix background (canvas, breathing pulse + pointer drift) ===== */
function DotField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dots = [];
    const pointer = { x: -9999, y: -9999 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gap = 30;
      dots = [];
      for (let x = gap / 2; x < w; x += gap) {
        for (let y = gap / 2; y < h; y += gap) {
          dots.push({ x, y, base: 0.8 + Math.random() * 0.7 });
        }
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const breathe = 0.5 + 0.5 * Math.sin(t / 2200);
      const cx = w / 2;
      const cy = h * 0.42;
      for (const d of dots) {
        const depth = 1 - Math.min(1, Math.hypot(d.x - cx, d.y - cy) / (w * 0.72));
        const dx = d.x - pointer.x;
        const dy = d.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        let ox = 0;
        let oy = 0;
        if (dist < 170 && dist > 0.01) {
          const push = (1 - dist / 170) * 9;
          ox = (dx / dist) * push;
          oy = (dy / dist) * push;
        }
        const r = d.base * (0.75 + 0.4 * breathe) * (0.55 + 0.45 * depth);
        ctx.beginPath();
        ctx.arc(d.x + ox, d.y + oy, Math.max(0.3, r), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.09 + 0.05 * breathe) * (0.4 + 0.6 * depth)})`;
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    }

    function onMove(e) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
    function onLeave() {
      pointer.x = -9999;
      pointer.y = -9999;
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    if (reduce) draw(0);
    else raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className="stage" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="stage-vignette" />
    </div>
  );
}

/* ===== Cloth banner with CAR-ENT text (waving in the air) ===== */
function ClothBanner() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const COLS = 22;
    const ROWS = 10;
    let points = [];
    let constraints = [];
    let tex = null;
    let w = 0;
    let h = 0;
    let gapX = 0;
    let gapY = 0;
    let dpr = 1;
    let raf = 0;

    function buildTexture() {
      tex = document.createElement('canvas');
      tex.width = Math.max(2, Math.round(w));
      tex.height = Math.max(2, Math.round(h));
      const tc = tex.getContext('2d');

      // White woven ground
      const g = tc.createLinearGradient(0, 0, 0, tex.height);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#f0f0f0');
      tc.fillStyle = g;
      tc.fillRect(0, 0, tex.width, tex.height);

      // faint weave
      const s = Math.max(5, Math.round(w * 0.006));
      tc.strokeStyle = 'rgba(0, 0, 0, 0.04)';
      tc.lineWidth = 1;
      for (let wy = s; wy < tex.height; wy += s) {
        tc.beginPath(); tc.moveTo(0, wy); tc.lineTo(tex.width, wy); tc.stroke();
      }
      for (let wx = s; wx < tex.width; wx += s) {
        tc.beginPath(); tc.moveTo(wx, 0); tc.lineTo(wx, tex.height); tc.stroke();
      }

      // black border
      const i1 = w * 0.014;
      const i2 = w * 0.027;
      tc.strokeStyle = '#1d1d1f';
      tc.lineWidth = Math.max(2, Math.round(w * 0.008));
      tc.strokeRect(i1, i1, tex.width - i1 * 2, tex.height - i1 * 2);
      tc.lineWidth = Math.max(1.5, Math.round(w * 0.004));
      tc.strokeRect(i2, i2, tex.width - i2 * 2, tex.height - i2 * 2);

      const serif = '"Playfair Display", Georgia, "Times New Roman", serif';
      const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const fs = Math.round(w * 0.15);
      const wmY = tex.height * 0.47;
      tc.textAlign = 'center';
      tc.textBaseline = 'middle';

      // top label
      tc.fillStyle = '#1d1d1f';
      tc.font = '600 ' + Math.max(10, Math.round(w * 0.026)) + 'px ' + sans;
      if ('letterSpacing' in tc) tc.letterSpacing = Math.round(w * 0.008) + 'px';
      tc.fillText('EST. 2026 · 12 CITIES', tex.width / 2, tex.height * 0.17);
      if ('letterSpacing' in tc) tc.letterSpacing = '0px';

      // big serif wordmark
      tc.fillStyle = '#1d1d1f';
      tc.font = '800 ' + fs + 'px ' + serif;
      if ('letterSpacing' in tc) tc.letterSpacing = Math.round(fs * 0.04) + 'px';
      tc.fillText('CAR-ENT', tex.width / 2, wmY);
      if ('letterSpacing' in tc) tc.letterSpacing = '0px';

      // rule
      tc.fillStyle = 'rgba(0, 0, 0, 0.3)';
      tc.fillRect(tex.width / 2 - fs * 0.9, wmY + fs * 0.6, fs * 1.8, Math.max(1, Math.round(w * 0.0025)));

      // sub label
      tc.fillStyle = '#6e6e73';
      tc.font = '600 ' + Math.max(10, Math.round(w * 0.03)) + 'px ' + sans;
      if ('letterSpacing' in tc) tc.letterSpacing = Math.round(w * 0.006) + 'px';
      tc.fillText('CARS · ON DEMAND', tex.width / 2, wmY + fs * 0.82);
      if ('letterSpacing' in tc) tc.letterSpacing = '0px';

      // bottom label
      tc.fillStyle = '#1d1d1f';
      tc.font = '600 ' + Math.max(10, Math.round(w * 0.024)) + 'px ' + sans;
      if ('letterSpacing' in tc) tc.letterSpacing = Math.round(w * 0.007) + 'px';
      tc.fillText('PEER-TO-PEER · DRIVE FREE', tex.width / 2, tex.height * 0.9);
      if ('letterSpacing' in tc) tc.letterSpacing = '0px';
    }

    function init() {
      points = [];
      for (let y = 0; y <= ROWS; y++) {
        const row = [];
        for (let x = 0; x <= COLS; x++) {
          const pin = y === 0;
          row.push({ x: x * gapX, y: y * gapY, px: x * gapX, py: y * gapY, pin });
        }
        points.push(row);
      }
      constraints = [];
      for (let yy = 0; yy <= ROWS; yy++) {
        for (let xx = 0; xx <= COLS; xx++) {
          if (xx < COLS) constraints.push({ a: points[yy][xx], b: points[yy][xx + 1], rest: gapX });
          if (yy < ROWS) constraints.push({ a: points[yy][xx], b: points[yy + 1][xx], rest: gapY });
        }
      }
      buildTexture();
    }

    function step(t) {
      for (let y = 0; y <= ROWS; y++) {
        for (let x = 0; x <= COLS; x++) {
          const p = points[y][x];
          if (p.pin) continue;
          const vx = (p.x - p.px) * 0.9;
          const vy = (p.y - p.py) * 0.9;
          p.px = p.x;
          p.py = p.y;
          p.x += vx;
          p.y += vy;
          p.y += 0.6;
          const wind = Math.sin(t * 0.0011 + p.y * 0.03) * 1.7 + Math.sin(t * 0.0017 + p.x * 0.018) * 0.9;
          p.x += wind;
          p.y += Math.sin(t * 0.0019 + p.x * 0.025) * 0.2;
        }
      }
      for (let i = 0; i < 3; i++) {
        for (let c = 0; c < constraints.length; c++) {
          const cn = constraints[c];
          const dx = cn.b.x - cn.a.x;
          const dy = cn.b.y - cn.a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const diff = ((dist - cn.rest) / dist) * 0.5;
          if (!cn.a.pin) { cn.a.x += dx * diff; cn.a.y += dy * diff; }
          if (!cn.b.pin) { cn.b.x -= dx * diff; cn.b.y -= dy * diff; }
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const p0 = points[y][x];
          const p1 = points[y][x + 1];
          const p2 = points[y + 1][x + 1];
          const p3 = points[y + 1][x];
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.clip();
          ctx.setTransform(
            (p1.x - p0.x) / tex.width, (p1.y - p0.y) / tex.width,
            (p3.x - p0.x) / tex.height, (p3.y - p0.y) / tex.height,
            p0.x, p0.y
          );
          ctx.drawImage(tex, 0, 0);
          ctx.restore();
        }
      }
    }

    function resize() {
      const parent = canvas.parentElement;
      const cw = Math.min(parent ? parent.clientWidth : 560, 560);
      w = Math.max(280, cw);
      h = Math.round(w * 0.36);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      gapX = w / COLS;
      gapY = h / ROWS;
      init();
    }

    function loop(t) {
      step(t);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    resize();

    if (reduce) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(tex, 0, 0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        buildTexture();
      });
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="cloth-wrap" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

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
      <DotField />

      <nav>
        <div className="nav-logo">
          CAR<span>-</span>ENT
        </div>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#support">Support</a>
          <a href="#login" className="nav-cta">
            Sign in
          </a>
        </div>
      </nav>

      {/* SPLIT HERO: left = content, right = login card */}
      <section className="hero-split" id="how">
        <div className="hero-left">
          <span className="badge">
            <span className="badge-dot" /> Now in 12 cities across India
          </span>
          <h1>
            Rent verified cars from <em>real owners</em>. Or list yours and earn — simple, transparent, yours.
          </h1>
          <p>No middlemen. No markups. Every car verified, every owner vetted.</p>
          <div className="hero-actions">
            <a href="#login" className="btn btn-primary">
              Start renting
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
            <a href="#login" className="btn btn-ghost">
              List your car
            </a>
          </div>
          <div className="stats">
            <div>
              <strong>2,500</strong>
              <span>Cars listed</span>
            </div>
            <div>
              <strong>12</strong>
              <span>Cities</span>
            </div>
            <div>
              <strong>98%</strong>
              <span>Satisfaction</span>
            </div>
          </div>
        </div>

        <div className="hero-right" id="login">
          <div className="login-box">
            <div className="login-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <h2 ref={loginTitleRef}>Welcome back.</h2>
            <p className="sub" ref={loginSubRef}>
              Sign in to continue.
            </p>

            <div className="role-row">
              <button type="button" className="role-btn is-active" ref={btnPickRef} onClick={() => setRole('pick')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
                Rent a car
              </button>
              <button type="button" className="role-btn" ref={btnGiveRef} onClick={() => setRole('give')}>
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

            <button type="button" className="submit-btn" disabled={submitting} onClick={handleSubmit}>
              <span ref={btnTextRef}>Continue</span>
            </button>

            <div className="or-divider">or continue with</div>

            <button type="button" className="google-btn" disabled={submitting} onClick={googleClick}>
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
              <a href="#" onClick={toggleMode}>
                {isRegister ? 'Sign in' : 'Create one'}
              </a>
            </div>
            <div className="error-msg" role="alert" aria-live="polite">
              {errorMsg}
            </div>

            <div className="login-secure">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Your information is encrypted and never shared.
            </div>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="pricing-card pricing-card--light">
          <div className="label">Renters</div>
          <div className="amount">₹0</div>
          <div className="period">Free, always</div>
          <div className="note">Browse, book, and drive. No subscription. No hidden fees.</div>
          <a href="#login" className="btn btn-dark btn-block">
            Start renting
          </a>
        </div>
        <div className="pricing-card pricing-card--accent">
          <div className="label">Car Owners</div>
          <div className="amount">₹100</div>
          <div className="period">per month</div>
          <div className="note">List your car, earn on your schedule. We handle bookings &amp; payments.</div>
          <a href="#login" className="btn btn-primary btn-block">
            List your car
          </a>
        </div>
      </section>

      <footer id="support">
        <div className="footer-brand">
          <div className="nav-logo">
            CAR<span>-</span>ENT
          </div>
          <p>Peer-to-peer car rental. Verified owners, verified cars, zero markups.</p>
        </div>
        <div className="footer-cols">
          <div>
            <h4>Renters</h4>
            <a href="#how">How it works</a>
            <a href="#pricing">Browse cars</a>
            <a href="#login">Sign in</a>
          </div>
          <div>
            <h4>Car owners</h4>
            <a href="#pricing">List your car</a>
            <a href="#pricing">Pricing</a>
            <a href="#support">Support</a>
          </div>
        </div>
        <div className="footer-bottom">Copyright © 2026 CAR-ENT. All rights reserved.</div>
      </footer>
    </>
  );
}
