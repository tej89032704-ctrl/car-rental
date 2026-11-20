import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useCarStats, useData, useRequestRows } from './data.jsx';
import { COLORS, avatarBg, carColor, dayCount, inr, inrP, pad2, rangeLabel, shortDate, todayISO } from './lib.js';
import { Icon } from './ui.jsx';
import CarArt from './CarArt.jsx';
import BookingChat from '../../../packages/shared/src/BookingChat.jsx';
import { NAV } from './nav.js';

/**
 * Every overlay the panel can raise: the car drawer, the request drawer, the
 * Add-a-car and Withdraw sheets, and the Ctrl+K palette.
 *
 * Weekend-surge stays a localStorage preference; auto-accept is a real column on
 * the car, because it decides server-side whether a booking needs the owner's
 * approval. Everything else -- rates, blocked dates, decisions, payouts --
 * round-trips to Postgres through the real endpoints, and the drawers read by id
 * from context so an approve re-renders against fresh server state.
 */

const pad = pad2;

/* Per-car toggles with no backend column yet (weekend surge): persisted locally. */
const prefKey = (id, k) => `oh-car-${id}-${k}`;
const readPref = (id, k) => {
  try { return localStorage.getItem(prefKey(id, k)) === '1'; } catch { return false; }
};
const writePref = (id, k, v) => {
  try { localStorage.setItem(prefKey(id, k), v ? '1' : '0'); } catch { /* private mode */ }
};

function CloseBtn({ onClick }) {
  return (
    <button className="ib xx" onClick={onClick} aria-label="Close">
      <Icon name="close" size={18} />
    </button>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <div className="sw" style={{ marginBottom: 14 }}>
      <span>{label}</span>
      <button
        type="button"
        className={`tg ${on ? 'on' : ''}`}
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ car --- */

function monthCells(month) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const lead = new Date(y, m, 1).getDay();
  const out = [];
  for (let i = 0; i < lead; i += 1) out.push(null);
  for (let d = 1; d <= days; d += 1) out.push(`${y}-${pad(m + 1)}-${pad(d)}`);
  return out;
}

function CarDrawer({ carId, close, toast, go }) {
  const { cars, reload } = useData();
  const car = cars.find((c) => c.id === carId);
  const stats = useCarStats().get(carId) || { trips: 0, earned: 0 };

  const [detail, setDetail] = useState(null);
  const [rate, setRate] = useState(() => Math.round((car?.daily_rate_paise || 150000) / 100));
  const [surge, setSurge] = useState(() => readPref(carId, 'surge'));
  // Auto-accept is server state, not a local preference: it is what decides
  // whether this car's bookings skip the approval queue. Loaded with the car
  // detail below and saved through /cars/:id/auto-accept.
  const [auto, setAuto] = useState(() => Number(car?.auto_accept) === 1);
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [blocked, setBlocked] = useState(() => new Set());
  const [toggled, setToggled] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  /* Pricing on the list is the daily rate only; the drawer needs the whole
     pricing row so a save can carry the security deposit forward instead of
     letting its `.default(0)` reset it. */
  useEffect(() => {
    let live = true;
    api(`/cars/${carId}`)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        setAuto(Number(d?.auto_accept) === 1);
      })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [carId]);

  useEffect(() => {
    let live = true;
    const y = month.getFullYear();
    const m = month.getMonth();
    const from = `${y}-${pad(m + 1)}-01`;
    const to = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
    api(`/cars/${carId}/availability?from=${from}&to=${to}`)
      .then((rows) => {
        if (!live) return;
        const held = (rows || [])
          .filter((r) => !(r.is_available === true || r.is_available === 1))
          .map((r) => r.date);
        setBlocked(new Set(held));
        setToggled(new Map());
      })
      .catch(() => { /* a month with no rows is just an empty grid */ });
    return () => { live = false; };
  }, [carId, month]);

  if (!car) {
    return (
      <div className="dp">
        <p className="mt">This car is no longer in your fleet.</p>
        <button className="o" onClick={close}>Close</button>
      </div>
    );
  }

  const isBlocked = (date) => (toggled.has(date) ? toggled.get(date) : blocked.has(date));

  function toggleDay(date) {
    if (date < todayISO()) return;
    setToggled((prev) => {
      const next = new Map(prev);
      const want = !isBlocked(date);
      if (want === blocked.has(date)) next.delete(date);
      else next.set(date, want);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setErr('');
    try {
      await api(`/cars/${carId}/pricing`, {
        method: 'PUT',
        body: {
          daily_rate_paise: rate * 100,
          // setPricing defaults this to 0, so send what we read back rather
          // than silently zeroing the deposit on every rate change.
          security_deposit_paise: detail?.pricing?.security_deposit_paise || 0,
        },
      });

      const unblock = [...toggled.entries()].filter(([, want]) => !want).map(([d]) => d);
      const hold = [...toggled.entries()].filter(([, want]) => want).map(([d]) => d);
      if (hold.length) {
        await api(`/cars/${carId}/availability`, { method: 'PUT', body: { dates: hold, is_available: false } });
      }
      if (unblock.length) {
        await api(`/cars/${carId}/availability`, { method: 'PUT', body: { dates: unblock, is_available: true } });
      }

      // Auto-accept only travels when it actually changed, so an unrelated save
      // (a new rate, a blocked day) never rewrites the setting underneath the
      // owner -- or worse, flips it back on a stale read.
      if ((auto ? 1 : 0) !== Number(detail?.auto_accept || 0)) {
        await api(`/cars/${carId}/auto-accept`, { method: 'PUT', body: { enabled: auto } });
      }

      writePref(carId, 'surge', surge);
      await reload();
      toast('Saved changes');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const y = month.getFullYear();
  const m = month.getMonth();
  const monthLabel = month.toLocaleDateString('en', { month: 'long', year: 'numeric' });

  return (
    <>
      <CloseBtn onClick={close} />
      <div className="stage">
        <CarArt category={car.category} color={carColor(car.id)} />
      </div>
      <div className="dp">
        <h3 style={{ font: '500 24px Fraunces' }}>{car.make} {car.model}</h3>
        <p className="mt" style={{ marginTop: 6 }}>
          {car.plate_number} · {stats.trips} trip{stats.trips === 1 ? '' : 's'} · {inrP(stats.earned)} earned
        </p>

        <div className="fr">
          <label htmlFor="rate">
            Daily rate
            <span>{inr(rate)} a day</span>
          </label>
          <input
            id="rate"
            type="range"
            min="200"
            max="20000"
            step="50"
            value={rate}
            onChange={(e) => setRate(+e.target.value)}
          />
        </div>

        <Toggle on={surge} onChange={setSurge} label="Weekend surge pricing" />
        <Toggle on={auto} onChange={setAuto} label="Auto-accept bookings" />

        <div className="sg3" style={{ margin: '18px 0' }}>
          <div><small>Transmission</small><b>{car.transmission || '—'}</b></div>
          <div><small>Fuel</small><b>{car.fuel_type || '—'}</b></div>
          <div><small>Seats</small><b>{car.seats || '—'}</b></div>
        </div>

        <div className="ph" style={{ marginTop: 6 }}>
          <b>Block dates</b>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="o" style={{ padding: '4px 10px' }}
              onClick={() => setMonth(new Date(y, m - 1, 1))} aria-label="Previous month">‹</button>
            <span style={{ fontSize: 13, color: 'var(--mut)' }}>{monthLabel}</span>
            <button className="o" style={{ padding: '4px 10px' }}
              onClick={() => setMonth(new Date(y, m + 1, 1))} aria-label="Next month">›</button>
          </span>
        </div>

        <div className="mc">
          {monthCells(month).map((date, i) => (date
            ? (
              <button
                key={date}
                type="button"
                className={isBlocked(date) ? 'bl' : ''}
                disabled={date < todayISO()}
                onClick={() => toggleDay(date)}
                aria-pressed={isBlocked(date)}
              >
                {+date.slice(-2)}
              </button>
            )
            : <span key={`gap-${i}`} />))}
        </div>

        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}

        <button className="b" style={{ width: '100%', marginTop: 18 }} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button className="o" style={{ width: '100%', marginTop: 10 }}
          onClick={() => { close(); go(`/cars/${carId}`); }}>
          Open full editor
        </button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- request --- */

function timelineFor(b) {
  const approved = ['confirmed', 'ongoing', 'completed'].includes(b.status);
  const gone = ['rejected', 'cancelled', 'declined'].includes(b.status);
  const running = ['ongoing', 'completed'].includes(b.status);
  const finished = b.status === 'completed';

  const steps = [{ label: `Request sent ${shortDate(b.created_at)}`, done: true }];

  if (gone) {
    steps.push({ label: 'Declined by owner', done: true });
    return steps;
  }
  if (!approved) {
    steps.push({ label: 'Awaiting your approval', done: false });
    steps.push({ label: `Pick-up ${shortDate(b.start_date)}`, done: false });
    steps.push({ label: `Drop-off ${shortDate(b.end_date)}`, done: false });
    return steps;
  }

  steps.push({ label: 'Approved by owner', done: true });
  if (running) steps.push({ label: `Pick-up ${shortDate(b.start_date)}`, done: true });
  if (b.status === 'ongoing') steps.push({ label: 'Trip in progress', done: true });
  if (b.status === 'ongoing') steps.push({ label: `Drop-off ${shortDate(b.end_date)}`, done: false });
  if (finished) steps.push({ label: `Returned ${shortDate(b.end_date)}`, done: true });
  return steps;
}

function ReqDrawer({ bookingId, close, toast, bellShake }) {
  const rows = useRequestRows();
  const { reload } = useData();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const b = rows.find((r) => r.id === bookingId);

  if (!b) {
    return (
      <div className="dp">
        <button className="ib xx" onClick={close} aria-label="Close"><Icon name="close" size={18} /></button>
        <p className="mt">This request is no longer in your queue.</p>
        <button className="o" style={{ marginTop: 14 }} onClick={close}>Close</button>
      </div>
    );
  }

  async function act(label, fn) {
    setBusy(label);
    setErr('');
    try {
      await fn();
      await reload();
      toast(label);
      bellShake();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  const decide = (decision) => act(
    decision === 'approve' ? 'Booking approved' : 'Request declined',
    () => api(`/bookings/${b.id}/decide`, { method: 'POST', body: { decision } }),
  );

  const name = b.renter?.name || 'Renter';
  const steps = timelineFor(b);
  const current = Math.min(steps.findIndex((s) => !s.done), steps.length - 1);
  const shown = current < 0 ? steps.length - 1 : current;

  return (
    <>
      <CloseBtn onClick={close} />
      <div className="dp">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span className="av" style={{ background: avatarBg(name) }}>{name[0].toUpperCase()}</span>
          <div>
            <b style={{ fontSize: 17 }}>{name}</b>
            <div className="mt" style={{ display: 'block', marginTop: 2 }}>
              {b.renter?.avg_rating
                ? `★ ${Number(b.renter.avg_rating).toFixed(1)} · ${b.renter.total_reviews || 0} reviews`
                : 'New renter'}
              <span className="vf">✓ trusted</span>
            </div>
          </div>
        </div>

        <div className="sg3">
          <div><small>Car</small><b>{b.car?.brand} {b.car?.model}</b></div>
          <div><small>Dates</small><b>{rangeLabel(b.start_date, b.end_date)}</b></div>
          <div><small>Payout</small><b>{inrP(b.total_amount_paise)}</b></div>
        </div>
        <p className="mt" style={{ marginTop: -8 }}>
          {dayCount(b.start_date, b.end_date)} day rental · {b.car?.plate}
        </p>

        <div className="tl">
          {steps.map((s, i) => (
            <div key={s.label + i} className={i === shown ? 'd' : ''}>{s.label}</div>
          ))}
        </div>

        <BookingChat bookingId={bookingId} otherLabel="renter" />

        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}

        {b.status === 'requested' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="b" style={{ flex: 1 }} disabled={!!busy} onClick={() => decide('approve')}>
              {busy === 'Booking approved' ? 'Approving…' : 'Approve'}
            </button>
            <button className="o r" style={{ flex: 1 }} disabled={!!busy} onClick={() => decide('reject')}>
              {busy === 'Request declined' ? 'Declining…' : 'Decline'}
            </button>
          </div>
        )}
        {b.status === 'confirmed' && (
          <button className="b" style={{ width: '100%', marginTop: 18 }} disabled={!!busy}
            onClick={() => act('Trip started', () => api(`/bookings/${b.id}/start-trip`, { method: 'POST' }))}>
            {busy === 'Trip started' ? 'Starting…' : 'Start trip'}
          </button>
        )}
        {b.status === 'ongoing' && (
          <button className="b" style={{ width: '100%', marginTop: 18 }} disabled={!!busy}
            onClick={() => act('Trip completed', () => api(`/bookings/${b.id}/complete`, { method: 'POST' }))}>
            {busy === 'Trip completed' ? 'Completing…' : 'Complete trip'}
          </button>
        )}
        {['completed', 'rejected', 'cancelled'].includes(b.status) && (
          <p className="mt" style={{ marginTop: 18, textAlign: 'center' }}>
            No actions left on this booking.
          </p>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------- add car --- */

const BODY_OPTIONS = ['hatchback', 'sedan', 'suv', 'luxury', 'van'];

function AddCarModal({ close, toast, go }) {
  const { reload } = useData();
  const [form, setForm] = useState({
    make: '', model: '', year: new Date().getFullYear(), plate_number: '',
    category: 'hatchback', transmission: 'manual', fuel_type: 'petrol', seats: 5,
    price: 1500,
  });
  const [color, setColor] = useState(COLORS[0]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    const plate = form.plate_number.trim().toUpperCase();
    if (!form.make.trim() || !form.model.trim()) return setErr('Make and model are required.');
    if (plate.length < 6) return setErr('Registration number looks too short.');
    if (!(Number(form.price) > 0)) return setErr('Enter a daily price above ₹0.');

    setErr('');
    setBusy(true);
    try {
      const car = await api('/cars', {
        method: 'POST',
        body: {
          make: form.make.trim(),
          model: form.model.trim(),
          year: Number(form.year),
          plate_number: plate,
          category: form.category,
          transmission: form.transmission,
          fuel_type: form.fuel_type,
          seats: Number(form.seats),
        },
      });
      await api(`/cars/${car.id}/pricing`, {
        method: 'PUT',
        body: { daily_rate_paise: Number(form.price) * 100 },
      });
      await reload();
      toast(`${form.make} ${form.model} created. Now upload photos and RC documents.`);
      close();
      go(`/cars/${car.id}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CloseBtn onClick={close} />
      <div className="dp">
        <div className="stage" style={{ height: 160 }}>
          <CarArt category={form.category} color={color} />
        </div>
        <div style={{ paddingTop: 18 }}>
          <p className="ey">Add a car</p>
          <div className="fg">
            <label>Make<input value={form.make} onChange={set('make')} placeholder="Maruti" /></label>
            <label>Model<input value={form.model} onChange={set('model')} placeholder="Swift" /></label>
            <label>Body type
              <select value={form.category} onChange={set('category')}>
                {BODY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Year<input type="number" min="1990" max="2030" value={form.year} onChange={set('year')} /></label>
            <label>Registration no
              <input value={form.plate_number} onChange={set('plate_number')} placeholder="KA01AB1234" />
            </label>
            <label>Price per day (₹)<input type="number" min="1" value={form.price} onChange={set('price')} /></label>
            <label>Transmission
              <select value={form.transmission} onChange={set('transmission')}>
                <option value="manual">Manual</option>
                <option value="automatic">Automatic</option>
              </select>
            </label>
            <label>Fuel
              <select value={form.fuel_type} onChange={set('fuel_type')}>
                {['petrol', 'diesel', 'ev', 'cng'].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label>Seats<input type="number" min="2" max="12" value={form.seats} onChange={set('seats')} /></label>
          </div>

          <p className="ey" style={{ marginTop: 14 }}>Paint</p>
          <div className="sws">
            {COLORS.map((c) => (
              <button key={c} type="button" className={c === color ? 'on' : ''}
                style={{ '--c': c }} onClick={() => setColor(c)} aria-label={`Paint ${c}`} />
            ))}
          </div>

          <p className="err">{err}</p>
          <button className="b" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={submit}>
            {busy ? 'Adding…' : 'Add to fleet'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- withdraw --- */

function WithdrawModal({ close, toast }) {
  const { earnings, reload } = useData();
  const available = Number(earnings?.wallet?.available_balance_paise) || 0;
  const max = Math.floor(available / 100);
  const [amount, setAmount] = useState(() => Math.max(100, Math.min(max || 100, Math.floor(max / 2) || 100)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      await api('/payouts/request', { method: 'POST', body: { amount_paise: Math.round(amount) * 100 } });
      await reload();
      toast(`Payout of ${inr(amount)} requested`);
      close();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (max <= 0) {
    return (
      <>
        <CloseBtn onClick={close} />
        <div className="dp">
          <p className="ey">Withdraw</p>
          <p className="mt">Nothing to withdraw yet — your wallet has no available balance.</p>
          <button className="o" style={{ width: '100%', marginTop: 16 }} onClick={close}>Close</button>
        </div>
      </>
    );
  }

  return (
    <>
      <CloseBtn onClick={close} />
      <div className="dp">
        <p className="ey">Withdraw</p>
        <p style={{ font: '300 40px Fraunces' }}>{inr(amount)}</p>
        <p className="mt" style={{ marginTop: 2 }}>of {inr(max)} available</p>

        <div className="fr">
          <label htmlFor="amt">Amount<span>{inr(amount)}</span></label>
          <input id="amt" type="range" min="100" max={max} step="100"
            value={Math.min(amount, max)} onChange={(e) => setAmount(+e.target.value)} />
        </div>

        <div className="sg3" style={{ margin: '4px 0 0' }}>
          <div><small>Available</small><b>{inr(max)}</b></div>
          <div><small>Pending</small><b>{inrP(earnings?.wallet?.pending_balance_paise)}</b></div>
          <div><small>Payouts</small><b>{(earnings?.payouts || []).length}</b></div>
        </div>

        <p className="err">{err}</p>
        <button className="b" style={{ width: '100%', marginTop: 6 }} disabled={busy || amount > max} onClick={submit}>
          {busy ? 'Requesting…' : `Withdraw ${inr(amount)}`}
        </button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- palette --- */

function Palette({ close, go, open }) {
  const { cars, requests } = useData();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const items = useMemo(() => {
    const all = [
      ...NAV.map((n) => ({ title: n.label, hint: n.sub, run: () => go(n.to) })),
      { title: 'Add a car', hint: 'Action', run: () => { open('addCar'); } },
      { title: 'Withdraw balance', hint: 'Action', run: () => { go('/earnings'); open('withdraw'); } },
      ...(cars || []).map((c) => ({
        title: `${c.make} ${c.model}`,
        hint: c.plate_number,
        run: () => go(`/cars/${c.id}`),
      })),
      ...(requests || []).map((r) => ({
        title: r.renter?.name || 'Booking request',
        hint: `${r.car?.brand || ''} ${r.car?.model || ''}`.trim(),
        run: () => { go('/requests'); open('req', r.id); },
      })),
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((i) => `${i.title} ${i.hint}`.toLowerCase().includes(needle));
  }, [q, cars, requests, go, open]);

  useEffect(() => { setIdx(0); }, [q]);

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[idx];
      if (item) { item.run(); close(); }
    }
  }

  return (
    <>
      <div className="pin">
        <Icon name="search" size={18} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search sections, cars, requests…"
          aria-label="Search"
        />
        <button className="ib" onClick={close} aria-label="Close"><Icon name="close" size={16} /></button>
      </div>
      <div className="pl">
        {items.length === 0 && <p className="pi" style={{ cursor: 'default' }}>No matches.</p>}
        {items.map((it, i) => (
          <div
            key={`${it.title}-${i}`}
            className={`pi ${i === idx ? 'on' : ''}`}
            onMouseEnter={() => setIdx(i)}
            onClick={() => { it.run(); close(); }}
          >
            <span>{it.title}</span>
            <small>{it.hint}</small>
          </div>
        ))}
      </div>
      <div className="pin" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}>
        <small className="mt">↑↓ move · ↵ open · esc close</small>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- router ---- */

export function OverlayRenderer({ overlay, close, open, toast, go, bellShake }) {
  switch (overlay.type) {
    case 'car':
      return <CarDrawer key={overlay.payload} carId={overlay.payload} close={close} toast={toast} go={go} />;
    case 'req':
      return <ReqDrawer key={overlay.payload} bookingId={overlay.payload} close={close} toast={toast} bellShake={bellShake} />;
    case 'addCar':
      return <AddCarModal close={close} toast={toast} go={go} />;
    case 'withdraw':
      return <WithdrawModal close={close} toast={toast} />;
    case 'palette':
      return <Palette close={close} go={go} open={open} />;
    default:
      return null;
  }
}
