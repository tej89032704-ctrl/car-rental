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

  const handleBookClick = (e, car) => {
    e.preventDefault();
    // In a real app, we would navigate to a booking flow or show a modal
    // For now, we'll just show a toast or alert
    alert(`Booking ${car.make} ${car.model} for ₹${(car.daily_rate_paise / 100).toFixed(0)}/day`);
  };

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
      <div className="grid">
        {cars.map((car, index) => (
          <article
            key={car.id}
            className="car"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <div className="ph" style={{ '--g1': '#2a2c31', '--g2': '#5b5e66' }}>
              <div className="car-svg">
                <svg viewBox="0 0 120 50" aria-hidden="true">
                  <path d="M6 36v-9l11-3 14-11h42l18 11 17 3v9z" />
                  <circle cx={31} cy={37} r={7} fill="#222" />
                  <circle cx={93} cy={37} r={7} fill="#222" />
                </svg>
              </div>
              <span className="tag">{car.category}</span>
              <button className="hrt" aria-label="Save">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78z" />
                </svg>
              </button>
              <button className="btn bk" onClick={(e) => handleBookClick(e, car)}>
                Book now
              </button>
            </div>
            <div className="ci">
              <div className="r">
                <b>{car.make}</b>
                <span className="px">{car.category.toUpperCase()}</span>
              </div>
              <p>
                {car.year} · {car.transmission} · {car.seats} seats
              </p>
              <div className="r">
                <b>₹{(car.daily_rate_paise / 100).toFixed(0)}/day</b>
                <span className="mut">
                  ★ {car.avg_rating?.toFixed(1) || '0'} · {car.total_reviews} reviews
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}