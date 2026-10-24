import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, currentUser } from '../api.js';
import CarArt from '../components/CarArt.jsx';
import { CATEGORY_LABEL, carTitle, inr, paintFor, ripple, toast, uprightFor } from '../components/ui.js';

const local = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 16);
};

function defaults(params) {
  const base = new Date(Date.now() + 86400000);
  base.setMinutes(0, 0, 0);
  const from = params.get('from') ? new Date(params.get('from')) : base;
  const until = params.get('until') ? new Date(params.get('until')) : new Date(from.getTime() + 172800000);
  return { start_date: local(from), end_date: local(until) };
}

export default function CarDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [car, setCar] = useState(null);
  const [reviews, setReviews] = useState({ reviews: [], avg_rating: 0, total_reviews: 0 });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(() => defaults(params));
  const [busy, setBusy] = useState(false);
  /* A rejected or placeholder upload (some seeds carry a 1px file) would be
     a flat colour across the whole ticket, so fall back to the artwork. */
  const [photoOk, setPhotoOk] = useState(true);

  useEffect(() => {
    api(`/cars/${id}`).then(setCar).catch((e) => setErr(e.message));
    api(`/cars/${id}/reviews`).then(setReviews).catch(() => {});
  }, [id]);

  async function book(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const b = await api('/bookings', {
        method: 'POST',
        body: { car_id: id, start_date: form.start_date, end_date: form.end_date },
      });
      setMsg(`Request sent — ${inr(b.total_amount_paise)} total. The owner approves it, then you pay 20% online.`);
      toast('Booking request sent');
    } catch (e2) {
      setErr(e2.message || 'Could not send that request');
    } finally {
      setBusy(false);
    }
  }

  if (!car) {
    return (
      <section className="pg">
        {err ? <div className="ce-err">{err}</div> : <div className="ce-load"><span className="spinner" /><span>Loading the car…</span></div>}
      </section>
    );
  }

  const price = car.pricing || {};
  const photo = car.photos?.[0]?.file_url;
  const verified = car.verification_status === 'verified';
  const category = String(car.category || '').toLowerCase();
  const canBook = currentUser && currentUser.kyc_status === 'approved';

  return (
    <section className="pg">
      <button type="button" className="ce-back" onClick={() => nav(-1)}>← Back to cars</button>

      <div className="hd">
        <div>
          <div className="ey">{car.make}</div>
          <h1>{carTitle(car)}</h1>
          <p>
            {[car.year, car.transmission, car.fuel_type, `${car.seats || 5} seats`, car.plate_number]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <b style={{ fontFamily: 'Fraunces, serif', fontSize: 40, fontWeight: 500 }}>
            {price.daily_rate_paise ? inr(price.daily_rate_paise) : '—'}
          </b>
          <div className="muted" style={{ fontSize: 13 }}>per day, all-in</div>
        </div>
      </div>

      <div className="panel tk">
        <div className="pic">
          {photo && photoOk
            ? (
              <img
                src={photo}
                alt={carTitle(car)}
                onError={() => setPhotoOk(false)}
                onLoad={(e) => { if (e.currentTarget.naturalWidth < 64) setPhotoOk(false); }}
              />
            )
            : <CarArt accent={paintFor(car)} upright={uprightFor(car)} />}
        </div>
        <div className="in">
          <span className="stt">{verified ? 'RC verified' : 'Owner-approved'}</span>
          <h2 style={{ marginTop: 12 }}>{car.make} {car.model}</h2>
          <div className="kv">
            <div><small>Body</small><b>{CATEGORY_LABEL[category] || category || 'Car'}</b></div>
            <div><small>Gearbox</small><b style={{ textTransform: 'capitalize' }}>{car.transmission || 'Manual'}</b></div>
            <div><small>Seats</small><b>{car.seats || 5}</b></div>
            <div><small>Fuel</small><b style={{ textTransform: 'capitalize' }}>{car.fuel_type || 'Petrol'}</b></div>
            {price.security_deposit_paise > 0 && (
              <div><small>Deposit</small><b>{inr(price.security_deposit_paise)}</b></div>
            )}
            {car.owner?.name && <div><small>Host</small><b>{car.owner.name}</b></div>}
          </div>
          {reviews.total_reviews > 0 && (
            <p className="muted" style={{ margin: 0 }}>
              ★ {Number(reviews.avg_rating).toFixed(1)} · {reviews.total_reviews} review{reviews.total_reviews === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 22 }}>
        <div style={{ padding: '26px 28px 0' }}>
          <h3 style={{ fontSize: 28 }}>Get a quote</h3>
          <p className="muted" style={{ margin: '4px 0 18px' }}>
            Send a request with your dates. The owner replies, then you pay 20% online and the rest at pickup.
          </p>
        </div>

        {msg && <div className="alert good" style={{ margin: '0 28px' }}>{msg}{' '}
          <Link to="/bookings" className="gh" style={{ marginLeft: 10, padding: '5px 14px' }}>View my bookings</Link>
        </div>}
        {err && <div className="ce-err" style={{ margin: '0 28px' }}>{err}</div>}

        {!currentUser ? (
          <div className="alert info" style={{ margin: '0 28px 24px' }}>
            You need an account to book this car. Browsing is free — booking needs a quick verification.{' '}
            <Link to="/login" style={{ fontWeight: 700 }}>Log in</Link> ·{' '}
            <Link to="/signup" style={{ fontWeight: 700 }}>Sign up</Link>
          </div>
        ) : !canBook ? (
          <div className="alert info" style={{ margin: '0 28px 24px' }}>
            <b>KYC verification required to book.</b> Your status: <b>{currentUser.kyc_status}</b>. Upload your
            documents and an admin verifies you.{' '}
            <Link to="/kyc" style={{ fontWeight: 700 }}>Complete KYC</Link>
          </div>
        ) : (
          <form className="ce-book" onSubmit={book}>
            <div className="f">
              <label htmlFor="ce-start">From</label>
              <input id="ce-start" type="datetime-local" value={form.start_date} required
                min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="ce-end">Until</label>
              <input id="ce-end" type="datetime-local" value={form.end_date} required
                min={form.start_date || new Date(Date.now() + 7200000).toISOString().slice(0, 16)}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <button className="go" type="submit" disabled={busy} onClick={ripple}>
              {busy ? 'Sending…' : 'Request booking'}
            </button>
          </form>
        )}

        <p className="ce-note">
          Request → owner approves → <b>pay 20% online</b> in My bookings → pay the rest at pickup.
          Free cancellation up to 24h before start.
        </p>
      </div>

      {reviews.reviews?.length > 0 && (
        <div className="panel" style={{ marginTop: 22 }}>
          <div style={{ padding: '26px 28px 8px' }}>
            <h3 style={{ fontSize: 26 }}>Reviews</h3>
          </div>
          {reviews.reviews.map((r) => (
            <div className="ce-review" key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <b>{r.reviewer_name}</b>
                <span className="star">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
              </div>
              {r.comment && <p>{r.comment}</p>}
              <small>{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
