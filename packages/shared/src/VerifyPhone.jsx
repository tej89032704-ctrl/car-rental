import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, clearSession, sessionUser, setSession } from './api.js';
import CarArt from './CarArt.jsx';
import '../styles/verify-phone.css';

/**
 * Phone verification at /verify-otp, shared by the renter and owner portals.
 *
 * The page is built to the supplied artwork: paper and brass under Cormorant
 * Garamond, a rotating brass edge around a split card, and the portal's own
 * scene on the right (green for renters, wine for owners). It is the second
 * step of the signup funnel, and the only step after it is profile details.
 *
 * It is not a gate. Signup already creates an active account and KYC is what
 * blocks bookings, so "Skip for now" is a first-class choice.
 *
 * The API returns the code in `dev_otp` while no SMS provider is connected
 * (NotificationsService.deliversSms). The page shows it and lets the visitor
 * fill it in — a verification screen that withholds the only code that exists
 * is a screen nobody can pass.
 */

const RESEND_SECONDS = 45;
const OTP_LENGTH = 6;

const SCENES = {
  renter: {
    ring: '20%',
    headline: 'Pay 20% online. The rest at pickup.',
    lead: 'Verified owners, cash at pickup and support at every hour.',
    caption: { title: 'Your next drive', sub: 'Verified cars near you', badge: 'KYC checked' },
    tiles: ['KYC first', '20% online', 'Cash at pickup'],
    stats: [
      { n: '20%', s: 'paid online by you' },
      { n: '24/7', s: 'support, any hour' },
      { n: 'KYC', s: 'owners checked' },
    ],
    marq: ['Hatchbacks', 'Sedans', 'SUVs', 'MUVs', 'Luxury', 'Vintage'],
    nav: [{ to: '/', label: 'Browse cars' }, { to: '/bookings', label: 'My bookings' }],
  },
  owner: {
    ring: 'KYC',
    headline: 'Your car, your price.',
    lead: 'Renters are KYC-verified and pay 20% online before pickup.',
    caption: { title: 'Hyundai Creta, 2022', sub: 'Preview of your listing', badge: 'Verified owner' },
    tiles: ['Cover', '+ Add photo', '+ Add photo'],
    stats: [
      { n: '20%', s: 'paid online by the renter' },
      { n: '24/7', s: 'support, any hour' },
      { n: 'KYC', s: 'renters checked before handover' },
    ],
    marq: ['Hatchbacks', 'Sedans', 'SUVs', 'MUVs', 'Luxury', 'Vintage'],
    nav: [{ to: '/', label: 'Owner dashboard' }],
  },
};

/** `+919876543210` -> `•••• 3210`; the last four are enough to recognise it. */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return phone || 'your phone';
  return `•••• ${digits.slice(-4)}`;
}

function headingWords(text) {
  const out = [];
  text.split(' ').forEach((word, i) => {
    // A real space between the inline-blocks: without it the accessible name
    // and any copied text read "Verifyyourphone".
    if (i) out.push(' ');
    out.push(
      <span className="vfy-w" key={`${word}-${i}`}>
        <i style={{ '--i': i }}>{word}</i>
      </span>,
    );
  });
  return out;
}

/* ── confetti, drawn on the fixed canvas the artwork uses ───────────────── */
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

export default function VerifyPhone({ portal = 'renter', brand = 'CAR-ENT', next = '/profile-details' } = {}) {
  const nav = useNavigate();
  const scene = SCENES[portal] || SCENES.renter;
  const user = sessionUser() || {};

  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(!!user.phone_verified);
  const [phone, setPhone] = useState(user.phone || '');

  const asked = useRef(false);
  const rootRef = useRef(null);
  const cardRef = useRef(null);
  const canvasRef = useRef(null);

  /* One code request when the page opens: the visitor should not have to press
     "resend" to receive the first one. */
  useEffect(() => {
    if (done || asked.current) return;
    asked.current = true;
    request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  useEffect(() => {
    if (!cooldown) return undefined;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /* Spotlight on the paper, and the same pointer light on the scene. */
  useEffect(() => {
    const root = rootRef.current;
    const panel = root?.querySelector('.vfy-scene');
    if (!root) return undefined;
    const move = (e) => {
      root.style.setProperty('--mx', `${e.clientX}px`);
      root.style.setProperty('--my', `${e.clientY}px`);
      if (!panel) return;
      const r = panel.getBoundingClientRect();
      panel.style.setProperty('--sx', `${e.clientX - r.left}px`);
      panel.style.setProperty('--sy', `${e.clientY - r.top}px`);
      // A restrained tilt, the same one the signup card uses.
      if (cardRef.current && matchMedia('(hover: hover)').matches) {
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        cardRef.current.style.transform = `rotateY(${x * 2.4}deg) rotateX(${-y * 2.4}deg)`;
      }
    };
    const leave = () => { if (cardRef.current) cardRef.current.style.transform = ''; };
    window.addEventListener('pointermove', move);
    root.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
    };
  }, []);

  async function request() {
    setSending(true);
    setErr('');
    try {
      const r = await api('/auth/otp/phone/request', { method: 'POST' });
      if (r?.already_verified) {
        setDone(true);
        setNote('');
        return;
      }
      setDevCode(r?.dev_otp || '');
      setNote(r?.dev_otp ? 'Enter the code shown above.' : 'A new code is on its way.');
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setErr(e.message || 'Could not send a code. Try again.');
      if (String(e.message || '').includes('(401)')) nav('/login');
    } finally {
      setSending(false);
    }
  }

  function typeCode(value) {
    setCode(value.replace(/\D/g, '').slice(0, OTP_LENGTH));
    setErr('');
  }

  function ripple(e) {
    const b = e.currentTarget;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) / 3;
    const span = document.createElement('span');
    span.className = 'vfy-rip';
    span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.append(span);
    setTimeout(() => span.remove(), 800);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (code.length !== OTP_LENGTH) {
      setErr(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await api('/auth/otp/phone/verify', { method: 'POST', body: { code } });
      // Refresh the cached user: the scene, profile page and sidebar all read
      // phone_verified from storage, and the server has just moved it.
      const me = await api('/auth/me').catch(() => null);
      if (me?.user) {
        setSession({ user: me.user });
        setPhone(me.user.phone || phone);
      }
      setDone(true);
      setNote('');
      setDevCode('');
      confetti(canvasRef.current);
      setTimeout(() => nav(next), 2400);
    } catch (e2) {
      setErr(e2.message || 'That code did not work.');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    clearSession();
    window.location.assign(`${import.meta.env.BASE_URL}login`);
  }

  return (
    <div className="vfy" data-portal={portal} ref={rootRef}>
      <canvas className="vfy-cv" ref={canvasRef} aria-hidden="true" />

      <header className="vfy-head">
        <Link className="vfy-logo" to="/" aria-label={brand}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M20 3L36 12V28L20 37L4 28V12Z M12 24Q20 10 28 24" />
          </svg>
          {brand}
        </Link>
        <nav className="vfy-nav" aria-label="Portal">
          {scene.nav.map((n) => (
            <Link key={n.to} to={n.to}>{n.label}</Link>
          ))}
          <button type="button" onClick={signOut}>Sign out</button>
        </nav>
      </header>

      <main className="vfy-main">
        <div className="vfy-edge" ref={cardRef}>
          <section className="vfy-card">
            <div className="vfy-form">
              <div className="vfy-prog">
                <span>{done ? 'Step 2 of 3 · done' : 'Step 2 of 3'}</span>
                <div className="vfy-bar"><b style={{ width: done ? '100%' : '66%' }} /></div>
              </div>

              <h1>{headingWords(done ? 'Phone verified' : 'Verify your phone')}</h1>
              <p className="vfy-sub">
                {done
                  ? 'Your number is confirmed. We will text pickup reminders and trip updates to it.'
                  : `Enter the ${OTP_LENGTH}-digit code we sent to your phone.`}
              </p>

              {done ? (
                <div className="vfy-done">
                  <svg className="vfy-tick" viewBox="0 0 100 100" aria-hidden="true">
                    <circle cx="50" cy="50" r="46" />
                    <path d="M30 52l14 14 27-30" />
                  </svg>
                  <p>You can change the number later in your profile.</p>
                  <button className="vfy-go" type="button" onClick={() => nav(next)}>
                    <span>Continue</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="vfy-num">
                    <span>Number</span>
                    <b>{maskPhone(phone)}</b>
                  </div>

                  {devCode && (
                    <div className="vfy-dev">
                      <div>
                        <b>Testing mode</b>
                        <small>No SMS provider is connected, so your code is shown here.</small>
                      </div>
                      <button type="button" onClick={() => typeCode(devCode)}>{devCode}</button>
                    </div>
                  )}

                  <form onSubmit={submit} noValidate>
                    <div className={`vfy-f${err ? ' bad' : ''}${code.length === OTP_LENGTH ? ' ok' : ''}`}>
                      <input
                        id="vfy-code"
                        value={code}
                        onChange={(e) => typeCode(e.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={OTP_LENGTH}
                        placeholder=" "
                        aria-label={`${OTP_LENGTH}-digit verification code`}
                        aria-invalid={!!err}
                      />
                      <label htmlFor="vfy-code">Verification code</label>
                      <svg className="vfy-ok" viewBox="0 0 24 24" fill="none" stroke="var(--brass)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12l5 5L20 6" />
                      </svg>
                    </div>

                    <p className={`vfy-hint${err ? ' show' : ''}`} role="alert">{err}</p>

                    <button
                      className={`vfy-go${busy ? ' busy' : ''}`}
                      type="submit"
                      onClick={ripple}
                      disabled={busy || code.length !== OTP_LENGTH}
                    >
                      <span>{busy ? 'Verifying…' : 'Verify phone'}</span>
                    </button>
                  </form>

                  <div className="vfy-alt">
                    <button
                      type="button"
                      className="vfy-link"
                      onClick={request}
                      disabled={sending || cooldown > 0}
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : sending ? 'Sending…' : 'Resend code'}
                    </button>
                    <button type="button" className="vfy-link" onClick={() => nav(next)}>
                      Skip for now
                    </button>
                    {note && <span className="vfy-note">{note}</span>}
                  </div>
                </>
              )}
            </div>

            <aside className="vfy-scene" aria-hidden="true">
              <svg className="vfy-ring" viewBox="0 0 80 80">
                <circle className="tr" cx="40" cy="40" r="36" />
                <circle className="pg" cx="40" cy="40" r="36" />
                <text x="40" y="46">{scene.ring}</text>
              </svg>

              <h2>{scene.headline}</h2>
              <p className="vfy-lead">{scene.lead}</p>

              <div className="vfy-stage">
                <figure className="vfy-photo">
                  <CarArt className="vfy-art" />
                  <figcaption className="vfy-cap">
                    <div>
                      <b>{scene.caption.title}</b>
                      <span>{scene.caption.sub}</span>
                    </div>
                    <span className="vfy-vo">{scene.caption.badge}</span>
                  </figcaption>
                </figure>
                <div className="vfy-tiles">
                  {scene.tiles.map((t) => <i key={t}>{t}</i>)}
                </div>
              </div>

              <div className="vfy-stats">
                {scene.stats.map((s) => (
                  <div key={s.s}><b>{s.n}</b><small>{s.s}</small></div>
                ))}
              </div>

              <div className="vfy-marq">
                <div className="vfy-track">
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
