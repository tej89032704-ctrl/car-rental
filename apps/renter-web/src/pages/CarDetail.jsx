import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, currentUser } from '../api.js';

export default function CarDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [car, setCar] = useState(null);
  const [reviews, setReviews] = useState({ reviews: [], avg_rating: 0, total_reviews: 0 });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ start_date: '', end_date: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/cars/${id}`).then(setCar).catch((e) => setErr(e.message));
    api(`/cars/${id}/reviews`).then(setReviews).catch(() => {});
  }, [id]);

  async function book(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      const b = await api('/bookings', { method: 'POST', body: { car_id: id, ...form } });
      setMsg(`Request sent! Total ₹${(b.total_amount_paise / 100).toFixed(0)}. The owner will approve it — you'll then pay 20% online and the rest at pickup.`);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  if (!car) return err ? <div className="alert err">{err}</div> : <p className="muted">Loading…</p>;
  const p = car.pricing;

  return (
    <>
      <div className="card">
        <div className="car-detail-layout">
          <img className="car-detail-img" src={car.photos?.[0]?.file_url || 'https://via.placeholder.com/400x220'} alt="" />
          <div className="car-detail-info">
            <h1 style={{ marginTop: 0 }}>{car.make} {car.model}</h1>
            <p className="muted">{car.year} · {car.category} · {car.transmission} · {car.fuel_type} · {car.seats} seats · {car.plate_number}</p>
            {reviews.total_reviews > 0 && (
              <p className="rating-inline">
                ★ {reviews.avg_rating} <span className="count">({reviews.total_reviews} review{reviews.total_reviews !== 1 ? 's' : ''})</span>
              </p>
            )}
            {p && <>
              <p className="price price-lg">₹{(p.daily_rate_paise / 100).toFixed(0)} / day</p>
              {p.weekly_rate_paise && <p className="muted">Weekly ₹{(p.weekly_rate_paise / 100).toFixed(0)}</p>}
              {p.monthly_rate_paise && <p className="muted">Monthly ₹{(p.monthly_rate_paise / 100).toFixed(0)}</p>}
              {p.security_deposit_paise > 0 && <p className="muted">Refundable deposit: ₹{(p.security_deposit_paise / 100).toFixed(0)}</p>}
            </>}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Book this car</h2>
        {msg && <div className="alert good">{msg} <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => nav('/bookings')}>View my bookings</button></div>}
        {err && <div className="alert err">{err}</div>}

        {!currentUser ? (
          <div className="alert info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>You need an account to book this car. Browse is free — booking requires verification.</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <Link to="/login" className="btn sm sec">Log in</Link>
              <Link to="/signup" className="btn sm">Sign up</Link>
            </span>
          </div>
        ) : currentUser.kyc_status !== 'approved' ? (
          <div className="alert info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>
              <b>KYC verification required to book.</b> Your status: <b>{currentUser.kyc_status}</b>. Upload your documents and an admin will verify you, then you can request bookings.
            </span>
            <Link to="/kyc" className="btn sm">Complete KYC</Link>
          </div>
        ) : (
        <form onSubmit={book}>
          <div className="row">
            <div className="form-group">
              <label className="f">Start date & time</label>
              <input className="f" type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: new Date(e.target.value).toISOString() })} required />
            </div>
            <div className="form-group">
              <label className="f">End date & time</label>
              <input className="f" type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: new Date(e.target.value).toISOString() })} required />
            </div>
          </div>
          <br />
          <button className="btn" disabled={busy}>{busy ? 'Checking…' : 'Request booking'}</button>
          <p className="muted" style={{ marginTop: 10 }}>
            Flow: request → owner approves → <b>pay 20% online</b> in My Bookings → pay the remaining 80% to the owner at pickup.
            Free cancellation up to 24h before start.
          </p>
        </form>
        )}
      </div>

      {reviews.reviews.length > 0 && (
        <div className="card">
          <h2>Reviews</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reviews.reviews.map((r) => (
              <div key={r.id} className="review-card">
                <div className="review-card-header">
                  <span className="review-card-name">{r.reviewer_name}</span>
                  <span className="rating">
                    {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                  </span>
                </div>
                {r.comment && <p className="review-card-comment">{r.comment}</p>}
                <p className="review-card-date">{new Date(r.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
