import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from './api.js';
import '../styles/auth-v2.css';

/**
 * Sign in / create account, shared by the renter and owner portals.
 *
 * The two portals had near-identical copies of these two pages; this is the
 * single implementation, with the differences passed in as props rather than
 * forked.
 *
 * Every field here is one the API actually accepts. `signupSchema`
 * (auth.controller.ts) takes exactly name, email, phone, password and role —
 * a design that also asked for a driving licence, a city or a car's
 * registration would collect input the server throws away, which is worse than
 * not asking: the user has no way to tell their typing went nowhere.
 *
 * Similarly there is no "keep me signed in" checkbox. `setSession()` always
 * writes both tokens to localStorage and there is no session-only mode to opt
 * into, so the box would be a control that appears to do something and does
 * not.
 */

/** Which API role each half of the role toggle maps to. */
const API_ROLE = { rent: 'car_renter', list: 'car_owner' };

/**
 * Which endpoint authenticates each portal. The API keeps the three portals
 * apart by URL rather than by the role it sends (`PORTAL_ROLES` in
 * auth.service.ts rejects a role that does not belong to the portal), so
 * posting admin credentials to /auth/login can never succeed — it answers
 * 401 "Invalid credentials for this portal" no matter the password.
 */
const LOGIN_ENDPOINT = {
  main: '/auth/login',
  admin: '/auth/admin/login',
  agent: '/auth/agent/login',
  manager: '/auth/manager/login',
};

const COPY = {
  manager: {
    brandline: 'Operations Hub', title: 'Welcome back, manager',
    sub: 'Guide your team, follow up enquiries and prepare rental quotes.', btn: 'Open operations hub',
    up1t: 'Staff accounts are provisioned', up1s: 'Ask a super admin to add you.',
    up2t: 'Secure your account', up2s: 'Choose a strong password.',
    yh: 'A clear view of every next step.', gauge: 'Your team', gaugeAt: 0.6,
    stats: [{ k: 'team', n: 'Team', s: 'assigned agents only' }, { k: 'crm', n: 'CRM', s: 'enquiries and quotes' }, { k: 'scope', n: 'Scoped', s: 'operations, not payouts' }],
    badges: ['✓ Team visibility', '✓ Rental quotes', '✓ Audited changes'],
    mq: ['Team workload', 'Customer enquiries', 'Follow-ups', 'Quotes', 'Activity history'],
  },
  rent: {
    brandline: 'Renter portal',
    title: 'Welcome back',
    sub: 'Sign in to rent or manage your bookings.',
    btn: 'Sign in',
    up1t: "Let's get you set up",
    up1s: 'Tell us who you are. It takes a minute.',
    up2t: 'Secure your account',
    up2s: 'Choose a password of at least 8 characters.',
    yh: 'Pay 20% online. The rest at pickup.',
    gauge: '20%',
    gaugeAt: 0.2,
    stats: [
      { k: 'pay', n: '20%', s: 'online, rest at pickup' },
      { k: 'cars', n: null, s: 'cars listed right now' },
      { k: 'kyc', n: 'KYC', s: 'checked before handover' },
    ],
    badges: ['✓ Verified owners', '✓ Cash at pickup', '✓ 24/7 support'],
    mq: null, // filled from the live fleet
  },
  list: {
    brandline: 'Owner portal',
    title: 'Welcome back, owner',
    sub: 'Check requests, manage your cars and see your payouts.',
    btn: 'Open owner dashboard',
    up1t: 'List your car in minutes',
    up1s: 'Tell us who you are. Add the car itself once you are in.',
    up2t: 'Secure your account',
    up2s: 'Choose a password of at least 8 characters.',
    yh: 'Your car earns while you are busy.',
    gauge: 'Your rate',
    gaugeAt: 0.65,
    stats: [
      { k: 'price', n: 'Your price', s: 'you set the rate' },
      { k: 'call', n: 'Your call', s: 'approve each booking' },
      { k: 'trip', n: 'Per trip', s: 'paid after handover' },
    ],
    badges: ['✓ You approve bookings', '✓ You set your price', '✓ Photos and details'],
    mq: ['Add photos', 'Set your price', 'Approve bookings', 'Hand over keys', 'Get paid'],
  },
  /* Staff roles. Neither has a self-serve signup — accounts are provisioned —
     so the toggle, the "create an account" path and the forgot-password link
     are all omitted by the portal's Login page rather than faked here. */
  admin: {
    brandline: 'ControlRoom',
    title: 'Platform operations',
    sub: 'Approve KYC, verify registrations and release payouts.',
    btn: 'Sign in',
    up1t: 'Staff accounts are provisioned',
    up1s: 'Ask a platform administrator to add you.',
    up2t: 'Secure your account',
    up2s: 'Choose a password of at least 8 characters.',
    yh: 'Every decision is written to the audit log.',
    gauge: 'Audited',
    gaugeAt: 0.8,
    stats: [
      { k: 'kyc', n: 'KYC', s: 'reviewed before approval' },
      { k: 'rc', n: 'RC', s: 'checked against VAHAN' },
      { k: 'pay', n: 'Payouts', s: 'released after trips' },
    ],
    badges: ['✓ Audited actions', '✓ 2FA enforced', '✓ Role-scoped access'],
    mq: ['KYC queue', 'Car verification', 'Payouts', 'Disputes', 'Audit log'],
  },
  agent: {
    brandline: 'AgentField',
    title: 'Welcome back, agent',
    sub: 'Sign in to work your assigned KYC and handover queue.',
    btn: 'Sign in',
    up1t: 'Field accounts are provisioned',
    up1s: 'Ask a platform administrator to add you.',
    up2t: 'Secure your account',
    up2s: 'Choose a password of at least 8 characters.',
    yh: 'Documents captured on site, reviewed the same day.',
    gauge: 'On site',
    gaugeAt: 0.55,
    stats: [
      { k: 'kyc', n: 'KYC', s: 'collected on site' },
      { k: 'doc', n: 'Docs', s: 'photographed and matched' },
      { k: 'ho', n: 'Handover', s: 'keys signed over' },
    ],
    badges: ['✓ Assigned queue', '✓ Photo evidence', '✓ Same-day review'],
    mq: ['KYC pickup', 'Document check', 'Selfie match', 'Key handover', 'Photo evidence'],
  },
};

/** Design placeholder, used only if the fleet request fails. */
const FALLBACK_MQ = [
  'Maruti Swift', 'Hyundai Creta', 'Tata Nexon', 'Mahindra Thar', 'Honda City',
  'Toyota Innova', 'Kia Seltos', 'Skoda Slavia', 'MG Hector', 'Tata Punch',
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The server's phone rule: /^\+?[0-9]{10,14}$/ after we strip separators. */
function cleanPhone(v) {
  return v.replace(/[\s()\-.]/g, '');
}

function strength(v) {
  if (!v) return 0;
  let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return s || 1;
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];

export default function AuthPage({
  view = 'in',
  brand = 'CAR-ENT',
  /** Both halves of the role toggle; one entry renders it locked to that role. */
  roles = ['rent', 'list'],
  defaultRole = 'rent',
  forgotHref = null,
  termsHref = '/terms',
  home = '/',
  /** 'main' for renter/owner; 'admin' and 'agent' each have their own endpoint. */
  portal = 'main',
} = {}) {
  const nav = useNavigate();
  const rootRef = useRef(null);
  const tiltRef = useRef(null);
  const inRef = useRef(null);
  const upRef = useRef(null);

  const locked = roles.length < 2;
  /** Staff portals have no self-serve signup, so its whole path stays hidden. */
  const staff = portal !== 'main';
  const [role, setRole] = useState(defaultRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [terms, setTerms] = useState(false);
  const [seePw, setSeePw] = useState(false);
  const [step, setStep] = useState(1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  /* Live fleet read from /cars/search; null until the request settles. */
  const [fleet, setFleet] = useState(null);
  /* Admin only: set once credentials pass, cleared when the code is verified
     or the user goes back to the email/password form. */
  const [twofaToken, setTwofaToken] = useState(null);
  const [code, setCode] = useState('');
  /* Where the admin code went, and — outside production only — the code itself. */
  const [twofaDelivery, setTwofaDelivery] = useState(null);
  const [devCode, setDevCode] = useState(null);

  const copy = COPY[role];
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── headlight trails ──────────────────────────────────────────────── */
  useEffect(() => {
    const bg = rootRef.current?.querySelector('.av2-bg');
    if (!bg) return;
    const streaks = [];
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('i');
      s.className = 'av2-streak' + (i % 3 === 0 ? ' r' : '');
      s.style.cssText =
        `top:${5 + Math.random() * 90}%;width:${120 + Math.random() * 260}px;` +
        `--d:${3 + Math.random() * 5}s;--dl:-${Math.random() * 8}s`;
      bg.append(s);
      streaks.push(s);
    }
    let ft;
    const race = () => {
      bg.classList.add('fast');
      clearTimeout(ft);
      ft = setTimeout(() => bg.classList.remove('fast'), 800);
    };
    window.addEventListener('input', race);
    return () => {
      window.removeEventListener('input', race);
      clearTimeout(ft);
      streaks.forEach((s) => s.remove());
    };
  }, []);

  /* ── real fleet count and marquee, from the public search endpoint ──── */
  useEffect(() => {
    let live = true;
    api('/cars/search')
      .then((rows) => {
        if (!live || !Array.isArray(rows)) return;
        const seen = new Set();
        const models = [];
        for (const c of rows) {
          const m = [c.make, c.model].filter(Boolean).join(' ').trim();
          if (m && !seen.has(m)) {
            seen.add(m);
            models.push(m);
          }
        }
        setFleet({ count: rows.length, models });
      })
      .catch(() => setFleet({ count: 0, models: [] }));
    return () => { live = false; };
  }, []);

  const mq = marqueeItems(copy.mq || (fleet?.models.length ? fleet.models : FALLBACK_MQ));

  /* ── gauge ─────────────────────────────────────────────────────────── */
  const [needle, setNeedle] = useState(1);
  useEffect(() => {
    if (view !== 'up') return undefined;
    setNeedle(1);
    const to = setTimeout(() => setNeedle(copy.gaugeAt), 900);
    // The owner's dial says "your rate", so a small wobble reads as a live
    // needle. The renter's dial is a literal 20%, and a needle drifting off
    // 20% would contradict the number printed under it.
    let iv;
    if (!reduced && role === 'list') {
      iv = setInterval(() => setNeedle(copy.gaugeAt + (Math.random() - 0.5) * 0.1), 1100);
    }
    return () => { clearTimeout(to); if (iv) clearInterval(iv); };
  }, [view, role, copy.gaugeAt, reduced]);

  /* ── counter sweep for the one stat that is a real number ──────────── */
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (view !== 'up' || !fleet?.count || reduced) { setShown(fleet?.count || 0); return undefined; }
    let raf;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 1400);
      setShown(Math.round(fleet.count * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [view, role, fleet?.count, reduced]);

  /* ── pointer: spotlight, card tilt, badge parallax, button ripple ───── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const move = (e) => {
      const x = e.clientX / innerWidth;
      const y = e.clientY / innerHeight;
      root.style.setProperty('--mx', e.clientX + 'px');
      root.style.setProperty('--my', e.clientY + 'px');
      if (reduced) return;
      if (view === 'in' && tiltRef.current) {
        tiltRef.current.style.transform =
          `perspective(900px) rotateY(${(x - 0.5) * 12}deg) rotateX(${(0.5 - y) * 10}deg)`;
      } else if (view === 'up') {
        root.querySelectorAll('.av2-fl').forEach((f) => {
          const d = Number(f.dataset.d) || 0;
          f.style.transform = `translate(${(x - 0.5) * d}px,${(y - 0.5) * d}px)`;
        });
      }
    };
    const leave = () => { if (tiltRef.current) tiltRef.current.style.transform = ''; };
    const down = (e) => {
      const b = e.target.closest('.av2-go');
      if (!b) return;
      const r = b.getBoundingClientRect();
      const s = document.createElement('span');
      s.className = 'av2-rip';
      s.style.cssText =
        `width:60px;height:60px;left:${e.clientX - r.left - 30}px;top:${e.clientY - r.top - 30}px`;
      b.append(s);
      setTimeout(() => s.remove(), 650);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down);
    root.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      root.removeEventListener('pointerleave', leave);
    };
  }, [view, reduced]);

  /* ── helpers ───────────────────────────────────────────────────────── */
  function bad(formRef, msg) {
    setErr(msg);
    const el = formRef.current;
    if (el) { el.classList.remove('av2-shake'); void el.offsetWidth; el.classList.add('av2-shake'); }
  }

  function swapRole(next) {
    setRole(next);
    setErr('');
    setStep(1);
  }

  function goStep(n) {
    setStep(n);
    setErr('');
  }

  function nextStep() {
    if (name.trim().length < 2) return bad(upRef.current, 'Enter your full name.');
    if (!EMAIL.test(email.trim())) return bad(upRef.current, 'Enter a valid email address.');
    if (cleanPhone(phone).replace(/^\+/, '').length < 10
      || cleanPhone(phone).replace(/^\+/, '').length > 14) {
      return bad(upRef.current, 'Enter a phone number with country code and 10 digits.');
    }
    goStep(2);
  }

  /* ── sign in ───────────────────────────────────────────────────────── */
  async function signIn(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!EMAIL.test(email.trim())) return bad(inRef.current, 'Enter a valid email address.');
    if (!password) return bad(inRef.current, 'Enter your password.');
    setBusy('in');
    try {
      const data = await api(LOGIN_ENDPOINT[portal] || LOGIN_ENDPOINT.main, {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      // The admin endpoint answers with a 2FA challenge instead of tokens;
      // verifyCode() below trades it for a real session.
      if (data.requires_2fa) {
        setTwofaToken(data.twofa_token);
        setTwofaDelivery(data.delivered_to || null);
        setDevCode(data.dev_code || null);
        setCode('');
        setBusy('');
        return;
      }
      setSession(data);
      nav(home, { state: { role: data.user?.role || API_ROLE[role] } });
    } catch (e2) {
      setBusy('');
      bad(inRef.current, e2.message);
    }
  }

  /* ── admin 2FA: exchange the challenge for a real session ───────────── */
  async function verifyCode(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!/^\d{6}$/.test(code)) return bad(inRef.current, 'Enter the 6-digit code.');
    setBusy('in');
    try {
      const data = await api('/auth/admin/login/verify', {
        method: 'POST',
        body: { twofa_token: twofaToken, code },
      });
      setSession(data);
      nav(home, { state: { role: data.user?.role } });
    } catch (e2) {
      setBusy('');
      bad(inRef.current, e2.message);
    }
  }

  /* ── create account ────────────────────────────────────────────────── */
  async function signUp(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (password.length < 8) return bad(upRef.current, 'Use a password with at least 8 characters.');
    if (!terms) return bad(upRef.current, 'Accept the Terms & Conditions to continue.');
    setBusy('up');
    const body = {
      name: name.trim(),
      email: email.trim(),
      phone: cleanPhone(phone),
      password,
      role: API_ROLE[role],
    };
    try {
      await api('/auth/signup', { method: 'POST', body });
      // Signup does not return a session, so sign in to get one: the app
      // redirects a signed-out user away from /verify-otp and
      // /profile-details, so the session has to exist before we navigate.
      //
      // Registration is complete at this point — the API creates an active
      // account — and both steps that follow are optional: verify the phone
      // (skippable) and then fill in the profile details (also skippable).
      const session = await api('/auth/login', { method: 'POST', body: { email: body.email, password } });
      setSession(session);
      nav('/verify-otp', { state: { role: body.role } });
    } catch (e2) {
      setBusy('');
      bad(upRef.current, e2.message);
    }
  }

  /* ── render ────────────────────────────────────────────────────────── */
  const segBtn = (target) => (
    <div className="av2-seg" data-i={target === 'up' ? 1 : 0}>
      <span className="pill" />
      <button type="button" className={target === 'in' ? 'on' : ''} onClick={() => nav('/login')}>
        Sign in
      </button>
      <button type="button" className={target === 'up' ? 'on' : ''} onClick={() => nav('/signup')}>
        Create account
      </button>
    </div>
  );

  const roleSeg = locked ? null : (
    <div className="av2-seg av2-role" data-i={role === 'list' ? 1 : 0}>
      <span className="pill" />
      <button type="button" className={role === 'rent' ? 'on' : ''} onClick={() => swapRole('rent')}>
        🚗 Rent a car
      </button>
      <button type="button" className={role === 'list' ? 'on' : ''} onClick={() => swapRole('list')}>
        🔑 List my car
      </button>
    </div>
  );

  const marquee = (
    <div className="av2-mq" aria-hidden="true">
      <div className="av2-track">{mq}</div>
    </div>
  );

  return (
    <div className="av2" data-view={view} data-role={role} ref={rootRef}>
      <div className="av2-bg"><div className="av2-spot" /></div>

      <header className="av2-top">
        <div className="av2-logo"><i /><span>{brand}</span></div>
        {!staff && segBtn(view)}
      </header>

      {view === 'in' && (
        <section className="av2-view av2-in">
          <div className="av2-live">
            <i />
            <span>
              {fleet
                ? <><b>{fleet.count}</b> cars listed right now</>
                : 'Checking what is listed right now…'}
            </span>
          </div>

          <div className="av2-tilt" ref={tiltRef}>
            <div className="av2-card">
              <div className="av2-brandline">{copy.brandline}</div>
              <h2 className="av2-h2">{copy.title}</h2>
              <p className="av2-sub">{copy.sub}</p>
              {roleSeg}

              {twofaToken ? (
                <form ref={inRef} onSubmit={verifyCode} noValidate>
                  <p className="av2-sub">
                    {twofaDelivery
                      ? <>We emailed a 6-digit code to <b>{twofaDelivery}</b>.</>
                      : 'Enter the 6-digit code we emailed to your account.'}
                  </p>
                  {devCode && (
                    <p className="av2-note">
                      No mail transport is configured, so your code is <b>{devCode}</b>.
                    </p>
                  )}
                  <label className="av2-f">
                    <input
                      type="text" inputMode="numeric" maxLength={6}
                      value={code} placeholder=" " autoComplete="one-time-code"
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    />
                    <span>6-digit code</span>
                  </label>

                  <p className="av2-err" role="alert">{busy === 'in' ? '' : err}</p>
                  <button className={'av2-go' + (busy === 'in' ? ' busy' : '')} type="submit" disabled={!!busy}>
                    <span className="t">{busy === 'in' ? 'Verifying…' : 'Verify code'}</span>
                  </button>

                  <div className="av2-opt">
                    <button
                      type="button" className="av2-link"
                      onClick={() => { setTwofaToken(null); setCode(''); setErr(''); setTwofaDelivery(null); setDevCode(null); }}
                    >
                      Use a different account
                    </button>
                  </div>
                </form>
              ) : (
              <form ref={inRef} onSubmit={signIn} noValidate>
                <label className="av2-f">
                  <input
                    type="email" value={email} placeholder=" " autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <span>Email</span>
                </label>
                <label className="av2-f">
                  <input
                    type={seePw ? 'text' : 'password'} value={password} placeholder=" "
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <span>Password</span>
                  <button
                    type="button" className="av2-eye"
                    aria-label={seePw ? 'Hide password' : 'Show password'}
                    aria-pressed={seePw}
                    onClick={() => setSeePw((s) => !s)}
                  >
                    {seePw ? '🙈' : '👁'}
                  </button>
                </label>

                {forgotHref && (
                  <div className="av2-opt">
                    <Link className="av2-link" to={forgotHref}>Forgot password?</Link>
                  </div>
                )}

                <p className="av2-err" role="alert">{busy === 'in' ? '' : err}</p>
                <button className={'av2-go' + (busy === 'in' ? ' busy' : '')} type="submit" disabled={!!busy}>
                  <span className="t">{busy === 'in' ? 'Signing in…' : copy.btn}</span>
                </button>
              </form>
              )}

              {!staff && (
                <p className="av2-sub" style={{ margin: '18px 0 0', fontSize: 14 }}>
                  New here? <Link className="av2-link" to="/signup">Create an account</Link>
                </p>
              )}
            </div>
          </div>

          {marquee}
        </section>
      )}

      {view === 'up' && (
        <section className="av2-view av2-up">
          <div className="av2-split">
            <div className="av2-fs">
              <div className="av2-prog">
                <span>Step {step} of 2</span>
                <div><i style={{ width: step * 50 + '%' }} /></div>
              </div>
              <h2 className="av2-h2">{step === 1 ? copy.up1t : copy.up2t}</h2>
              <p className="av2-sub">{step === 1 ? copy.up1s : copy.up2s}</p>

              <form ref={upRef} onSubmit={signUp} noValidate>
                <div className="av2-step" hidden={step !== 1}>
                  {roleSeg}
                  <label className="av2-f">
                    <input
                      type="text" value={name} placeholder=" " autoComplete="name"
                      onChange={(e) => setName(e.target.value)}
                    />
                    <span>Full name</span>
                  </label>
                  <label className="av2-f">
                    <input
                      type="email" value={email} placeholder=" " autoComplete="email"
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <span>Email</span>
                  </label>
                  <label className="av2-f">
                    <input
                      type="tel" value={phone} placeholder=" " autoComplete="tel"
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <span>Phone number</span>
                  </label>
                  <p className="av2-err" role="alert">{step === 1 ? err : ''}</p>
                  <button className="av2-go" type="button" onClick={nextStep}>
                    <span className="t">Continue</span>
                  </button>
                </div>

                <div className="av2-step" hidden={step !== 2}>
                  <label className="av2-f">
                    <input
                      type={seePw ? 'text' : 'password'} value={password} placeholder=" "
                      autoComplete="new-password"
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <span>Password (8+ characters)</span>
                    <button
                      type="button" className="av2-eye"
                      aria-label={seePw ? 'Hide password' : 'Show password'}
                      aria-pressed={seePw}
                      onClick={() => setSeePw((s) => !s)}
                    >
                      {seePw ? '🙈' : '👁'}
                    </button>
                  </label>
                  <div className="av2-meter" data-s={strength(password)}>
                    <i /><i /><i /><i />
                    <small>{password ? STRENGTH_LABEL[strength(password)] : ''}</small>
                  </div>
                  <label className="av2-chk">
                    <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                    <span>
                      I agree to the <Link className="av2-link" to={termsHref}>Terms &amp; Conditions</Link>
                    </span>
                  </label>
                  <p className="av2-err" role="alert">{step === 2 ? err : ''}</p>
                  <div className="av2-row">
                    <button className="av2-go ghost" type="button" onClick={() => goStep(1)}>Back</button>
                    <button className={'av2-go' + (busy === 'up' ? ' busy' : '')} type="submit" disabled={!!busy}>
                      <span className="t">{busy === 'up' ? 'Creating account…' : 'Create account'}</span>
                    </button>
                  </div>
                </div>
              </form>

              <p className="av2-sub" style={{ margin: '18px 0 0', fontSize: 14 }}>
                Already have an account? <Link className="av2-link" to="/login">Sign in</Link>
              </p>
            </div>

            <aside className="av2-yel">
              <h3>{copy.yh}</h3>
              <div className="av2-gauge">
                <svg viewBox="0 0 240 162" aria-hidden="true">
                  <path
                    d="M20 120A100 100 0 0 1 220 120" fill="none"
                    stroke="rgba(0,0,0,.18)" strokeWidth="12" strokeLinecap="round"
                  />
                  <path
                    className="av2-arc" d="M20 120A100 100 0 0 1 220 120" fill="none"
                    stroke="currentColor" strokeWidth="12" strokeLinecap="round"
                    pathLength="100" strokeDasharray="100" strokeDashoffset={100 - needle * 100}
                  />
                  <g stroke="currentColor" strokeWidth="2">
                    {Array.from({ length: 11 }, (_, i) => {
                      const a = ((-90 + i * 18) * Math.PI) / 180;
                      const r1 = 86;
                      const r2 = i % 5 ? 92 : 98;
                      return (
                        <line
                          key={i} x1={120 + Math.sin(a) * r1} y1={120 - Math.cos(a) * r1}
                          x2={120 + Math.sin(a) * r2} y2={120 - Math.cos(a) * r2}
                        />
                      );
                    })}
                  </g>
                  <g
                    className="av2-needle"
                    style={{ transform: `rotate(${-90 + needle * 180}deg)`, color: 'var(--red)' }}
                  >
                    <line x1="120" y1="120" x2="120" y2="40" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </g>
                  <circle cx="120" cy="120" r="9" fill="currentColor" />
                  <text
                    x="120" y="150" textAnchor="middle" fontSize="15" fontWeight="800"
                    fill="currentColor" opacity={needle < 0.99 ? 1 : 0}
                  >
                    {copy.gauge}
                  </text>
                </svg>
              </div>
              <div className="av2-stats">
                {copy.stats.map((s) => (
                  <div key={s.k}>
                    <b>{s.n === null ? shown.toLocaleString() : s.n}</b>
                    <small>{s.s}</small>
                  </div>
                ))}
              </div>
              {copy.badges.map((b, i) => (
                <span
                  key={b} className="av2-fl" data-d={[30, -24, 18][i]}
                  style={{
                    top: 150 + i * 55,
                    ...(i % 2 ? { left: 26 } : { right: 30 }),
                    animationDelay: `${-i}s`,
                  }}
                >
                  {b}
                </span>
              ))}
              {marquee}
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Duplicate the item list so the -50% marquee keyframe loops seamlessly: the
 * track is `items + items`, and translating by half its width lands exactly
 * where the second copy begins.
 */
function marqueeItems(items) {
  const out = [];
  let base = items;
  while (base.length < 12) base = [...base, ...items];
  for (const x of [...base, ...base]) out.push(<span key={out.length}>{x}</span>);
  return out;
}
