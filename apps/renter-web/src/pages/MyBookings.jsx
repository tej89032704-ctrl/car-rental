import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, currentUser } from '../api.js';
import CarArt from '../components/CarArt.jsx';
import { carTitle, day, inr, paintFor, ripple, toast, tripRange, uprightFor } from '../components/ui.js';

const STATUS_LABEL = {
  requested: 'Awaiting owner',
  confirmed: 'Confirmed',
  ongoing: 'On the road',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TONE = { requested: 'w', confirmed: '', ongoing: '', completed: 'n', cancelled: 'e' };

function countdown(startDate, nowMs) {
  if (!startDate) return '';
  const start = new Date(`${String(startDate).slice(0, 10)}T10:00:00`);
  if (Number.isNaN(start.getTime())) return '';
  let secs = Math.floor((start - nowMs) / 1000);
  if (secs <= 0) return '';
  const d = Math.floor(secs / 86400);
  secs %= 86400;
  const h = Math.floor(secs / 3600);
  secs %= 3600;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const z = (v) => String(v).padStart(2, '0');
  return `Pickup in ${d}d ${z(h)}h ${z(m)}m ${z(s)}s`;
}

export default function MyBookings() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    api('/bookings/my')
      .then((data) => { if (live) { setRows(Array.isArray(data) ? data : []); setErr(''); } })
      .catch((e) => { if (live) setErr(e.message || 'Could not load your bookings'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const active = rows
    .filter((b) => ['ongoing', 'confirmed', 'requested'].includes(b.status))
    .sort((a, b) => {
      const rank = { ongoing: 0, confirmed: 1, requested: 2 };
      return (rank[a.status] - rank[b.status]) || String(a.start_date).localeCompare(String(b.start_date));
    })[0];

  const past = rows.filter((b) => ['completed', 'cancelled'].includes(b.status));
  // Requests that are not the featured trip still deserve a line — otherwise a
  // later-dated request disappears until it becomes the next one.
  const waiting = rows.filter((b) => b.status === 'requested' && b.id !== active?.id);
  const city = currentUser?.city || 'Bengaluru';
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city)}`;

  return (
    <section className="pg">
      <div className="hd">
        <div>
          <h1>My bookings</h1>
          <p>Your next trip first, then everything you have driven.</p>
        </div>
      </div>

      {err && <div className="ce-err">{err}</div>}
      {loading && !err && <div className="ce-load"><span className="spinner" /><span>Loading your bookings…</span></div>}

      {!loading && !err && !rows.length && (
        <div className="ce-empty">
          <h3>No trips yet</h3>
          <p>Pick a car and send a request — the owner approves it, then you pay 20% online.</p>
          <Link className="go" style={{ display: 'inline-block', marginTop: 18, padding: '13px 26px' }} to="/">Find a car</Link>
        </div>
      )}

      {active && (
        <div className="panel tk">
          <div className="pic">
            <CarArt
              accent={paintFor({ id: active.car_id, category: active.car?.category })}
              upright={uprightFor(active.car)}
            />
          </div>
          <div className="in">
            <span className={`stt ${TONE[active.status] || 'n'}`}>{STATUS_LABEL[active.status] || active.status}</span>
            {active.status !== 'requested' && <span className="cd">{countdown(active.start_date, now)}</span>}
            <h2 style={{ marginTop: 12 }}>{carTitle(active.car)}</h2>
            <div className="kv">
              <div><small>Pick-up</small><b>{day(active.start_date)}</b></div>
              <div><small>Return</small><b>{day(active.end_date)}</b></div>
              <div><small>Location</small><b>{city}</b></div>
              <div><small>Total</small><b>{inr(active.total_amount_paise)}</b></div>
            </div>
            <div className="ce-form-actions" style={{ marginTop: 0 }}>
              {active.status === 'confirmed' && !active.online_paid_paise && (
                <button type="button" className="go" onClick={() => nav(`/bookings/${active.id}`)}>
                  Pay 20% online ({inr(Math.round(active.total_amount_paise * 0.2))})
                </button>
              )}
              <button type="button" className="gh" onClick={() => nav(`/bookings/${active.id}`)}>Manage booking</button>
              <a className="gh" href={maps} target="_blank" rel="noreferrer">Get directions</a>
            </div>
          </div>
        </div>
      )}

      {waiting.length > 0 && (
        <>
          <h3 style={{ margin: '34px 0 14px' }}>Awaiting approval</h3>
          <div className="panel rows">
            {waiting.map((b) => (
              <div key={b.id}>
                <div className="th">
                  <CarArt accent={paintFor({ id: b.car_id, category: b.car?.category })} upright={uprightFor(b.car)} />
                </div>
                <div>
                  <h3><Link to={`/bookings/${b.id}`}>{carTitle(b.car)}</Link></h3>
                  <p>{tripRange(b.start_date, b.end_date)}{b.owner?.name ? ` · Host ${b.owner.name}` : ''}</p>
                </div>
                <div className="am">{inr(b.total_amount_paise)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="stt w">{STATUS_LABEL[b.status]}</span>
                  <button type="button" className="gh" onClick={() => nav(`/bookings/${b.id}`)}>View</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h3 style={{ margin: '34px 0 14px' }}>Past trips</h3>
          <div className="panel rows">
            {past.map((b) => (
              <div key={b.id}>
                <div className="th">
                  <CarArt accent={paintFor({ id: b.car_id, category: b.car?.category })} upright={uprightFor(b.car)} />
                </div>
                <div>
                  <h3><Link to={`/bookings/${b.id}`}>{carTitle(b.car)}</Link></h3>
                  <p>
                    {tripRange(b.start_date, b.end_date)}
                    {b.owner?.name ? ` · Host ${b.owner.name}` : ''}
                  </p>
                </div>
                <div className="am">{inr(b.total_amount_paise)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`stt ${TONE[b.status] || 'n'}`}>{STATUS_LABEL[b.status] || b.status}</span>
                  {b.status === 'completed' && !b.has_reviewed && (
                    <button
                      type="button"
                      className="go"
                      style={{ padding: '7px 16px', margin: 0, fontSize: 13 }}
                      onClick={() => nav(`/bookings/${b.id}`)}
                    >
                      Leave a review
                    </button>
                  )}
                  {b.car?.id && b.status !== 'completed' && (
                    <button
                      type="button"
                      className="gh"
                      onClick={(e) => { ripple(e); toast(`Opening ${carTitle(b.car)}`); nav(`/cars/${b.car.id}`); }}
                    >
                      View car
                    </button>
                  )}
                  {b.status === 'completed' && b.car?.id && (
                    <button
                      type="button"
                      className="gh"
                      onClick={(e) => { ripple(e); toast(`Opening ${carTitle(b.car)}`); nav(`/cars/${b.car.id}`); }}
                    >
                      Book again
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !err && rows.length > 0 && !past.length && !active && (
        <p className="muted" style={{ marginTop: 20 }}>Completed trips will collect here.</p>
      )}
    </section>
  );
}
