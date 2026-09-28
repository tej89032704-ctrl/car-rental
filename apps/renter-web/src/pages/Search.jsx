import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, currentUser } from '../api.js';
import { RatingSummary } from '../../../../packages/shared/src/Reviews.jsx';

export default function Search() {
  const [cars, setCars] = useState([]);
  const [category, setCategory] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api(`/cars/search${category ? `?category=${category}` : ''}`)
      .then(setCars).catch((e) => setErr(e.message));
  }, [category]);

  return (
    <>
      <div className="hero">
        <h1>Self-drive cars, right at your doorstep</h1>
        <p style={{ opacity: .95 }}>Browse verified, owner-approved cars from local hosts and book in minutes.</p>
        <div className="hero-badges">
          <span><b>✓</b> KYC-verified hosts</span>
          <span><b>✓</b> Owner-approved cars</span>
          <span><b>✓</b> No hidden charges</span>
        </div>
        {!currentUser && (
          <div style={{ marginTop: 22, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link to="/signup" className="btn">Sign up to book</Link>
            <Link to="/login" className="btn sec">Log in</Link>
          </div>
        )}
      </div>
      {err && <div className="alert err">{err}</div>}
      <div className="tabs">
        {['', 'hatchback', 'sedan', 'suv', 'luxury', 'van'].map((c) => (
          <button key={c} className={`tab ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
            {c || 'All'}
          </button>
        ))}
      </div>
      {cars.length === 0 && !err && <div className="card"><p className="muted">No cars available right now.</p></div>}
      <div className="grid-cars">
        {cars.map((c) => (
          <Link to={`/cars/${c.id}`} className="car-card" key={c.id}>
            <img src={c.cover_photo || 'https://via.placeholder.com/300x150?text=No+Photo'} alt="" />
            <div className="car-body">
              <div className="car-title">{c.make} {c.model}{c.category && <span className="car-cat">{c.category}</span>}{c.verification_status === 'verified' && <span className="pill active" style={{ marginLeft: 6, fontSize: 11 }}>RC verified ✓</span>}</div>
              <div className="car-meta">{c.year} · {c.category} · {c.transmission} · {c.seats} seats</div>
              <div className="car-rating-row">
                <span className="price">₹{(c.daily_rate_paise / 100).toFixed(0)}/day</span>
                <RatingSummary avg={c.avg_rating} count={c.total_reviews} emptyText="No reviews yet" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
