import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from './api.js';
import CarArt from './CarArt.jsx';
import '../styles/signup-split.css';

/**
 * Create account, shared by the renter and owner portals.
 *
 * Built to the two supplied artworks — "List your car" for the owner and the
 * renter create-account demo — so both portals sign up through the same paper
 * and brass card, with only the scene half and the copy changing.
 *
 * Every field is one the API accepts. `signupSchema` (auth.controller.ts) takes
 * exactly name, email, phone, password and role, so the artwork's "car make and
 * model" field is not asked for here: the car is added on the owner dashboard
 * once the account exists, and a field the server discards would be worse than
 * none. The scene's photo frame and photo tiles stand in for that next step.
 *
 * Signup answers without a session, so the page signs in immediately after —
 * the routes that follow (/verify-otp, /profile-details) bounce a signed-out
 * visitor to /login.
 */

const ROLE = { rent: 'car_renter', list: 'car_owner' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RULES = {
  name: (v) => v.replace(/\s/g, '').length >= 2,
  email: (v) => EMAIL.test(v.trim()),
  phone: (v) => {
    const n = v.replace(/\D/g, '').length;
    return n >= 10 && n <= 14;
  },
  pw: (v) => v.length >= 8,
};

const HINTS = {
  name: 'Enter your full name.',
  email: 'Use an email like name@example.com.',
  phone: 'Enter at least 10 digits.',
  pw: 'Use 8+ characters with a number and a symbol.',
};

const STRENGTH_TEXT = [
  'Use 8+ characters with a number and a symbol.',
  'Weak. Add a number or symbol.',
  'Fair. One more mix of characters helps.',
  'Good. Almost there.',
  'Strong password.',
];

const RENTER = {
  headline: 'Pay 20% online. The rest at pickup.',
  lead: 'Verified owners, cash at pickup and support at every hour.',
  ring: '20%',
  caption: { title: 'Your next drive', sub: 'Verified cars near you', badge: 'KYC checked' },
  tiles: null,
  stats: [
    { n: '20%', s: 'paid online by you' },
    { n: '24/7', s: 'support, any hour' },
    { n: 'KYC', s: 'owners checked' },
  ],
  marq: ['Hatchbacks', 'Sedans', 'SUVs', 'MUVs', 'Luxury', 'Vintage'],
};

const OWNER = {
  headline: 'Your car, your price.',
  lead: 'Renters are KYC-verified and pay 20% online before pickup.',
  ring: '20%',
  caption: { title: 'Your first listing', sub: 'Photos and rate, once you are in', badge: 'Verified owner' },
  tiles: ['Cover', '+ Add photo', '+ Add photo'],
  stats: [
    { n: '20%', s: 'paid online by the renter' },
    { n: '24/7', s: 'support, any hour' },
    { n: 'KYC', s: 'renters checked before handover' },
  ],
  marq: ['Hatchbacks', 'Sedans', 'SUVs', 'MUVs', 'Luxury', 'Vintage'],
};

const COPY = {
  rent: {
    first: 'Let’s get you set up',
    firstSub: 'Create your renter account. It takes a minute.',
    second: 'Secure your account',
    secondSub: 'Choose a password you don’t use anywhere else.',
    terms: 'I agree to the terms and to ID verification before I pick up a car.',
    nav: 'List your car',
    altLead: 'Own a car?',
    altLabel: 'List it instead',
    done: 'Next, verify your phone so we can text you pickup reminders.',
  },
  list: {
    first: 'List your car',
    firstSub: 'Share your details first. You’ll add your car next.',
    second: 'Secure your account',
    secondSub: 'Choose a password you don’t use anywhere else.',
    terms: 'I agree to the terms and to ID verification before I hand over a car.',
    nav: 'Rent a car',
    altLead: 'Just here to rent?',
    altLabel: 'Create a renter account',
    done: 'Next, verify your phone so renters can reach you about a handover.',
  },
};

/** The signup form's strength ladder — the score is 1..4, or 0 when empty. */
function strength(v) {
  if (!v) return 0;
  let s = 0;
  if (v.length >= 8) s += 1;
  if (/\d/.test(v)) s += 1;
  if (/[^\w\s]/.test(v)) s += 1;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s += 1;
  return s;
}

const METER_COLORS = [null, 'var(--danger)', '#d08a3c', 'var(--brass)', '#4fa77f'];

/**
 * Confetti on the fixed canvas the artwork uses. Same burst as the phone
 * step, so the two celebrations are recognisably the same page.
 */
function confetti(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.scale(dpr, dpr);
  const cols = ['#c6a15b', '#ecd9a8', '#f6f0e4', '#4a1a2b', '#a9833c'];
  const bits = Array.from({ length: 110 }, () => ({
    x: innerWidth / 2,
    y: innerHeight / 2,
    vx: (Math.random() - 0.5) * 14,
    vy: Math.random() * -13 - 3,
    w: 4 + Math.random() * 6,
    h: 2 + Math.random() * 4,
    r: Math.random() * 6,
    vr: (Math.random() - 0.5) * 0.35,
    c: cols[Math.floor(Math.random() * cols.length)],
  }));
  let frame = 0;
  (function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.3;
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= 0.99;
      b.r += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    frame += 1;
    if (frame < 190) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })();
}

/**
 * The other portal's signup: a separate origin in dev (5173 renter, 5174
 * owner) and a path prefix on the shared production origin (/renter, /owner).
 * Same rule as public/login-split.html, so both halves of the funnel send the
 * visitor to the same place.
 */
function otherPortal(portal, path) {
  const target = portal === 'owner' ? 'renter' : 'owner';
  const dev = ['5173', '5174'].includes(window.location.port);
  if (dev) {
    return `${window.location.protocol}//${window.location.hostname}:${target === 'owner' ? '5174' : '5173'}${path}`;
  }
  return `/${target}${path}`;
}

function Heading({ text }) {
  return (
    <h1 key={text}>
      {text.split(' ').map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          {i > 0 && ' '}
          <span className="su-w"><i style={{ '--i': i }}>{word}</i></span>
        </Fragment>
      ))}
    </h1>
  );
}

export default function SignupSplit({ portal = 'renter' } = {}) {
  const nav = useNavigate();
  const owner = portal === 'owner';
  const role = owner ? 'list' : 'rent';
  const copy = COPY[role];
  const scene = owner ? OWNER : RENTER;

  const rootRef = useRef(null);
  const cardRef = useRef(null);
  const canvasRef = useRef(null);
  const timers = useRef([]);

  const [v, setV] = useState({ name: '', email: '', phone: '', pw: '' });
  const [bad, setBad] = useState({});
  const [step, setStep] = useState(1);
  const [terms, setTerms] = useState(false);
  const [seePw, setSeePw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const pwScore = strength(v.pw);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /* Pointer light on the paper and the scene, plus a restrained tilt. */
  useEffect(() => {
    const root = rootRef.current;
    const panel = root?.querySelector('.su-scene');
    if (!root) return undefined;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const move = (e) => {
      root.style.setProperty('--mx', `${e.clientX}px`);
      root.style.setProperty('--my', `${e.clientY}px`);
      if (!panel) return;
      const r = panel.getBoundingClientRect();
      panel.style.setProperty('--sx', `${e.clientX - r.left}px`);
      panel.style.setProperty('--sy', `${e.clientY - r.top}px`);
      if (reduce || !cardRef.current || !matchMedia('(hover: hover)').matches) return;
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cardRef.current.style.transform = `rotateY(${x * 2.4}deg) rotateX(${-y * 2.4}deg)`;
    };
    const leave = () => { if (cardRef.current) cardRef.current.style.transform = ''; };
    window.addEventListener('pointermove', move);
    root.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
    };
  }, []);

  function set(key, value) {
    setV((s) => ({ ...s, [key]: value }));
    setBad((b) => (b[key] ? { ...b, [key]: false } : b));
    setErr('');
  }

  /**
   * Only complain once a field has content and focus has left it.
   *
   * The state is left alone when the verdict has not changed: a blur that
   * re-renders is a blur that can move the button the pointer is already
   * pressing, and the click is then lost between mousedown and mouseup.
   */
  function blur(key) {
    if (!v[key]) return;
    const next = !RULES[key](v[key]);
    setBad((b) => (b[key] === next ? b : { ...b, [key]: next }));
  }

  function next() {
    const order = ['name', 'email', 'phone'];
    const fails = order.filter((k) => !RULES[k](v[k]));
    if (fails.length) {
      setBad(Object.fromEntries(fails.map((k) => [k, true])));
      document.getElementById(`su-${fails[0]}`)?.focus();
      return;
    }
    setErr('');
    setStep(2);
  }

  function ripple(e) {
    const b = e.currentTarget;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) / 3;
    const span = document.createElement('span');
    span.className = 'su-rip';
    span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.append(span);
    setTimeout(() => span.remove(), 800);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!RULES.pw(v.pw)) {
      setBad({ pw: true });
      document.getElementById('su-pw')?.focus();
      return;
    }
    if (!terms) {
      setErr('Accept the terms to continue.');
      return;
    }
    setBusy(true);
    /* A local flag, not the state: the catch below runs before React has
       re-rendered, so reading `created` there would still see false. */
    let signedUp = false;
    const body = {
      name: v.name.trim(),
      email: v.email.trim(),
      phone: v.phone.replace(/[\s().-]/g, ''),
      password: v.pw,
      role: ROLE[role],
    };
    try {
      await api('/auth/signup', { method: 'POST', body });
      signedUp = true;
      const session = await api('/auth/login', {
        method: 'POST',
        body: { email: body.email, password: body.password },
      });
      setBusy(false);
      setDone(true);
      confetti(canvasRef.current);
      /* The session is written last, on purpose. /signup is an anonymous page
         to both portals' shells: the moment setSession() lands, `sessionUser()`
         turns truthy and the route redirects to the app home, unmounting this
         card before the welcome is seen (and skipping the phone step).
         Creating the account has already succeeded, so the only thing held
         back for these 1.7s is the token — leaving now costs a sign-in, not
         the account. */
      timers.current.push(setTimeout(() => {
        setSession(session);
        nav('/verify-otp', { replace: true, state: { role: body.role } });
      }, 1700));
    } catch (e2) {
      setBusy(false);
      setErr(signedUp
        ? `${e2.message || 'Your account was created'} — sign in to continue.`
        : (e2.message || 'Could not create your account.'));
    }
  }

  const first = v.name.trim().split(/\s+/)[0] || 'there';

  return (
    <div className="su" data-portal={portal} ref={rootRef}>
      <canvas className="su-cv" ref={canvasRef} aria-hidden="true" />

      <header className="su-head">
        <a className="su-logo" href={import.meta.env.BASE_URL} aria-label="CAR-ENT">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M20 3L36 12V28L20 37L4 28V12Z M12 24Q20 10 28 24" />
          </svg>
          CAR-ENT
        </a>
        <nav className="su-nav" aria-label="Portal">
          <Link to="/login">Sign in</Link>
          <Link to="/signup" aria-current="page">Create account</Link>
          <a href={otherPortal(portal, '/signup')}>{copy.nav}</a>
        </nav>
      </header>

      <main className="su-main">
        <div className="su-edge" ref={cardRef}>
          <section className="su-card">
            <div className="su-form">
              <div className="su-prog">
                <span>Step {step} of 2</span>
                <div className="su-bar"><b style={{ width: step === 2 ? '100%' : '50%' }} /></div>
              </div>

              <Heading text={step === 1 ? copy.first : copy.second} />
              <p className="su-sub">{step === 1 ? copy.firstSub : copy.secondSub}</p>

              {step === 1 ? (
                <form className="su-step" onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
                  <div className={`su-f${v.name && RULES.name(v.name) ? ' ok' : ''}${bad.name ? ' bad' : ''}`}>
                    <input
                      id="su-name"
                      value={v.name}
                      onChange={(e) => set('name', e.target.value)}
                      onBlur={() => blur('name')}
                      placeholder=" "
                      autoComplete="name"
                      aria-invalid={!!bad.name}
                      aria-describedby={bad.name ? 'su-name-hint' : undefined}
                    />
                    <label htmlFor="su-name">Full name</label>
                    <Check />
                  </div>
                  <p className={`su-hint${bad.name ? ' show' : ''}`} id="su-name-hint" aria-hidden={!bad.name}>{HINTS.name}</p>

                  <div className={`su-f${v.email && RULES.email(v.email) ? ' ok' : ''}${bad.email ? ' bad' : ''}`}>
                    <input
                      id="su-email"
                      type="email"
                      value={v.email}
                      onChange={(e) => set('email', e.target.value)}
                      onBlur={() => blur('email')}
                      placeholder=" "
                      autoComplete="email"
                      aria-invalid={!!bad.email}
                      aria-describedby={bad.email ? 'su-email-hint' : undefined}
                    />
                    <label htmlFor="su-email">Email</label>
                    <Check />
                  </div>
                  <p className={`su-hint${bad.email ? ' show' : ''}`} id="su-email-hint" aria-hidden={!bad.email}>{HINTS.email}</p>

                  <div className={`su-f${v.phone && RULES.phone(v.phone) ? ' ok' : ''}${bad.phone ? ' bad' : ''}`}>
                    <input
                      id="su-phone"
                      type="tel"
                      inputMode="tel"
                      value={v.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      onBlur={() => blur('phone')}
                      placeholder=" "
                      autoComplete="tel"
                      aria-invalid={!!bad.phone}
                      aria-describedby={bad.phone ? 'su-phone-hint' : undefined}
                    />
                    <label htmlFor="su-phone">Phone number</label>
                    <Check />
                  </div>
                  <p className={`su-hint${bad.phone ? ' show' : ''}`} id="su-phone-hint" aria-hidden={!bad.phone}>{HINTS.phone}</p>

                  <button className="su-go" type="submit" onClick={ripple}>
                    <span>Continue</span>
                  </button>

                  <p className="su-alt">
                    <span>Already have an account? <Link to="/login">Sign in</Link></span>
                    <span>{copy.altLead} <a href={otherPortal(portal, '/signup')}>{copy.altLabel}</a></span>
                  </p>
                </form>
              ) : (
                <form className="su-step" onSubmit={submit} noValidate>
                  <div className={`su-f${v.pw && RULES.pw(v.pw) ? ' ok' : ''}${bad.pw ? ' bad' : ''}`}>
                    <input
                      id="su-pw"
                      type={seePw ? 'text' : 'password'}
                      value={v.pw}
                      onChange={(e) => set('pw', e.target.value)}
                      onBlur={() => blur('pw')}
                      placeholder=" "
                      autoComplete="new-password"
                      aria-invalid={!!bad.pw}
                      aria-describedby="su-pw-text"
                    />
                    <label htmlFor="su-pw">Create password</label>
                    <button
                      type="button"
                      className="su-eye"
                      aria-label={seePw ? 'Hide password' : 'Show password'}
                      aria-pressed={seePw}
                      onClick={() => setSeePw((s) => !s)}
                    >
                      {seePw ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  <div className="su-meter" aria-hidden="true">
                    {[1, 2, 3, 4].map((i) => (
                      <i
                        key={i}
                        style={i <= pwScore ? { background: METER_COLORS[pwScore], height: 3 } : undefined}
                      />
                    ))}
                  </div>
                  <p className="su-pwtxt" id="su-pw-text">
                    {bad.pw && !v.pw ? HINTS.pw : STRENGTH_TEXT[pwScore]}
                  </p>

                  <label className="su-chk">
                    <input type="checkbox" checked={terms} onChange={(e) => { setTerms(e.target.checked); setErr(''); }} />
                    <span>
                      {copy.terms} <Link to="/terms">Read the terms</Link>
                    </span>
                  </label>

                  <p className="su-err" role="alert">{err}</p>

                  <button
                    className={`su-go${busy ? ' busy' : ''}`}
                    type="submit"
                    onClick={ripple}
                    disabled={busy || done}
                  >
                    <span>{busy ? 'Creating account…' : 'Create account'}</span>
                  </button>

                  <button className="su-back" type="button" onClick={() => { setStep(1); setErr(''); }}>
                    Back
                  </button>
                </form>
              )}

              {done && (
                <div className="su-done" role="status">
                  <svg className="su-tick" viewBox="0 0 100 100" aria-hidden="true">
                    <circle cx="50" cy="50" r="46" />
                    <path d="M30 52l14 14 27-30" />
                  </svg>
                  <h2>Welcome, {first}</h2>
                  <p>{copy.done}</p>
                </div>
              )}
            </div>

            <aside className="su-scene" aria-hidden="true">
              <svg className="su-ring" viewBox="0 0 80 80">
                <circle className="tr" cx="40" cy="40" r="36" />
                <circle className="pg" cx="40" cy="40" r="36" />
                <text x="40" y="46">{scene.ring}</text>
              </svg>

              <h2>{scene.headline}</h2>
              <p className="su-lead">{scene.lead}</p>

              <div className="su-stage">
                <figure className="su-photo">
                  <CarArt viewBox="0 0 600 260" />
                  <figcaption className="su-cap">
                    <div>
                      <b>{scene.caption.title}</b>
                      <span>{scene.caption.sub}</span>
                    </div>
                    <span className="su-vo">{scene.caption.badge}</span>
                  </figcaption>
                </figure>
                {scene.tiles && (
                  <div className="su-tiles">
                    {scene.tiles.map((t, i) => <i key={`${t}-${i}`}>{t}</i>)}
                  </div>
                )}
              </div>

              <div className="su-stats">
                {scene.stats.map((s) => (
                  <div key={s.s}><b>{s.n}</b><small>{s.s}</small></div>
                ))}
              </div>

              <div className="su-marq">
                <div className="su-track">
                  {[...scene.marq, ...scene.marq].map((m, i) => <span key={`${m}-${i}`}>{m}</span>)}
                </div>
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}

function Check() {
  return (
    <svg className="su-ok" viewBox="0 0 24 24" fill="none" stroke="var(--brass)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}
