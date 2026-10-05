import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';
import { Link } from 'react-router-dom';

export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newReview, setNewReview] = useState({ rating: 0, comment: '' });
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const loadReviews = async () => {
      if (!currentUser) return;
      try {
        const data = await api('/reviews/my');
        setReviews(Array.isArray(data) ? data : []);
        setError('');
      } catch (e) {
        if (String(e.message || '').includes('(401)')) {
          // navigate to login
          window.location.href = '/login';
          return;
        }
        setError(e.message || 'Failed to load reviews');
      } finally {
        setLoading(false);
      }
    };
    loadReviews();
  }, [currentUser]);

  const handleRatingChange = (rating) => {
    setNewReview(prev => ({ ...prev, rating }));
  };

  const handleCommentChange = (e) => {
    setNewReview(prev => ({ ...prev, comment: e.target.value }));
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (newReview.rating === 0) {
      alert('Please select a rating');
      return;
    }
    setPosting(true);
    try {
      await api('/reviews', {
        method: 'POST',
        body: {
          rating: newReview.rating,
          comment: newReview.comment || undefined,
        }
      });
      setNewReview({ rating: 0, comment: '' });
      // Reload reviews
      const data = await api('/reviews/my');
      setReviews(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Failed to post review');
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading your reviews…</p>
      </div>
    );
  }

  if (error && !reviews.length) {
    return (
      <div className="auth-box card">
        <p className="error">{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  // Calculate average rating
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;
  const totalReviews = reviews.length;

  return (
    <>
      <div className="renter-page-header">
        <span className="header-icon">📝</span>
        <h1>My Reviews</h1>
        <p className="subtitle">What you shared about your trips.</p>
      </div>

      <div className="two">
        {/* Left column: Average rating and rating breakdown */}
        <div className="card sp">
          <div className="big" data-n={totalReviews.toFixed(0)} data-f="0">
            {totalReviews.toFixed(0)}
          </div>
          <div className="st">
            {'★'.repeat(Math.floor(avgRating))}
            {avgRating % 1 >= 0.5 ? '½' : ''}
            {'☆'.repeat(5 - Math.ceil(avgRating))}
          </div>
          <p className="mut">
            Average from {totalReviews} reviews
          </p>
          <div className="chips">
            {[5, 4, 3, 2, 1].map((n) => (
              <span key={n} className="chip">
                {n}
                <span className="mut">
                  {reviews.filter(r => r.rating === n).length} reviews
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Right column: Write a review and list of existing reviews */}
        <div>
          <div className="card rv">
            <h3>Write a review</h3>
            <div className="sin" id="sin">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  data-s={n}
                  aria-label={`${n} stars`}
                  className={n === newReview.rating ? 'on' : ''}
                  onClick={() => handleRatingChange(n)}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              id="rt"
              placeholder="How was your trip?"
              value={newReview.comment}
              onChange={handleCommentChange}
              rows="4"
            />
            <button
              className="btn"
              id="rs"
              onClick={handleSubmitReview}
              disabled={posting}
            >
              {posting ? 'Posting…' : 'Post review'}
            </button>
          </div>
          <div id="rl">
            {reviews.map((r, index) => (
              <div
                key={r.id}
                className="card rv sp"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="r">
                  <b>{r.target_name || 'Trip'}</b>
                  <span className="mut">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className="st">
                  {'★'.repeat(r.rating)}
                </div>
                <p>{r.comment || 'No comment provided'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Back to search link */}
      <div className="back-link">
        <button className="btn sec" onClick={() => window.location.href = '/'}>
          ← Back to Search
        </button>
      </div>
    </>
  );
}