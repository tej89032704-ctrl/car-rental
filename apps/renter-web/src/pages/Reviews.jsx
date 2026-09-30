import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, currentUser } from '../api.js';
import { Stars, RatingSummary } from '../../../../packages/shared/src/Reviews.jsx';

/**
 * Two distinct things renters/owners care about:
 *   1. "Written by me" — what I said about a car/owner/renter after a trip
 *   2. "About me"      — what other people said about me
 * Each has its own endpoint, so each is loaded independently: one failing
 * must not blank the other.
 */
const TARGET_LABEL = { car: 'Car', owner: 'Owner', renter: 'Renter' };
const TARGET_PILL = { car: 'active', owner: 'confirmed', renter: 'requested' };

export default function Reviews() {
  const [written, setWritten] = useState(null);
  const [about, setAbout] = useState(null);
  const [err, setErr] = useState('');
  const [aboutErr, setAboutErr] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    api('/reviews/my').then(setWritten).catch((e) => setErr(e.message));
    api('/reviews/about-me').then(setAbout).catch((e) => setAboutErr(e.message));
  }, []);

  const writtenList = Array.isArray(written) ? written : [];

  return (
    <>
      <div className="page-header">
        <h1>My Reviews</h1>
        <p className="subtitle">Ratings you've left after trips — and what others said about you</p>
      </div>

      {/* ---------- 2. What others said about me ---------- */}
      <section className="card">
        <h2>About me</h2>
        {aboutErr && <div className="alert err">{aboutErr}</div>}
        {!about && !aboutErr && <p className="muted">Loading…</p>}
        {about && (
          <>
            <div className="car-rating-row" style={{ justifyContent: 'flex-start', gap: 16 }}>
              <RatingSummary avg={about.avg_rating} count={about.total_reviews} emptyText="No one has reviewed you yet" />
            </div>

            {about.reviews.length === 0 && (
              <p className="muted" style={{ marginTop: 10 }}>
                Once a trip ends, the other party can rate you. Those comments will show up here.
              </p>
            )}

            {about.reviews.length > 0 && (
              <div className="review-list">
                {about.reviews.map((r) => (
                  <div className="review-card" key={r.id}>
                    <div className="review-card-header">
                      <span className="review-card-name">{r.reviewer_name}</span>
                      <span className="rating"><Stars value={r.rating} /></span>
                    </div>
                    {r.car && (
                      <div style={{ marginBottom: 6 }}>
                        <span className="pill active">{r.car.brand} {r.car.model}</span>
                      </div>
                    )}
                    {r.comment && <p className="review-card-comment">{r.comment}</p>}
                    <p className="review-card-date">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ---------- 1. What I wrote ---------- */}
      <section className="card">
        <h2>Written by me</h2>
        {err && <div className="alert err">{err}</div>}
        {written === null && !err && <p className="muted">Loading…</p>}

        {written !== null && writtenList.length === 0 && (
          <div className="notifications-empty">
            <div className="empty-icon">⭐</div>
            <p>You haven't reviewed a trip yet.</p>
            <p className="muted" style={{ fontSize: 13 }}>
              Reviews can be left once a booking is completed —{' '}
              <Link to="/bookings">go to My Bookings</Link>.
            </p>
          </div>
        )}

        {writtenList.length > 0 && (
          <>
            <p className="rating-inline" style={{ margin: '0 0 4px' }}>
              {writtenList.length} review{writtenList.length !== 1 ? 's' : ''} written
            </p>
            <div className="review-list">
              {writtenList.map((r) => (
                <div className="review-card" key={r.id}>
                  <div className="review-card-header">
                    <span className="review-card-name">
                      {r.target_name || TARGET_LABEL[r.target_type] || 'Review'}
                    </span>
                    <span className="rating"><Stars value={r.rating} /></span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                    <span className={`pill ${TARGET_PILL[r.target_type] || ''}`}>
                      {TARGET_LABEL[r.target_type] || r.target_type}
                    </span>
                    {r.car && (
                      <span className="muted" style={{ fontSize: 13 }}>
                        {r.car.brand} {r.car.model}
                      </span>
                    )}
                  </div>

                  {r.comment && <p className="review-card-comment">{r.comment}</p>}
                  <p className="review-card-date">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
