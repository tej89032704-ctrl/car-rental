import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useNavigate } from 'react-router-dom';
import { CarIcon } from '../../../../packages/shared/src/icons.jsx';

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('up'); // up, past, cancel
  const [countdownIntervals, setCountdownIntervals] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api('/bookings/my');
        setBookings(Array.isArray(data) ? data : []);
        setError('');
      } catch (e) {
        if (String(e.message || '').includes('(401)')) {
          navigate('/login');
          return;
        }
        setError(e.message || 'Network error — check your connection');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const navigate = useNavigate();

  const handleCancel = async (bookingId) => {
    // In a real app, we would show a modal for cancellation reason
    if (window.confirm('Are you sure you want to cancel this booking?')) {
      try {
        await api(`/bookings/${bookingId}/cancel`, { method: 'POST' });
        load();
      } catch (e) {
        setError(e.message || 'Cancel failed');
      }
    }
  };

  // Clean up countdown intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(countdownIntervals).forEach(clearInterval);
    };
  }, [countdownIntervals]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading your bookings…</p>
      </div>
    );
  }

  if (error && !bookings.length) {
    return (
      <div className="auth-box card">
        <p className="error">{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="renter-page-header">
        <span className="header-icon">🧾</span>
        <h1>My Bookings</h1>
        <p className="subtitle">
          Your 20% advance is paid online. The rest is paid at pickup.
        </p>
      </div>

      {/* Tabs */}
      <div className="pills" id="bt">
        <button
          className={tab === 'up' ? 'on' : ''}
          data-t="up"
          onClick={() => setTab('up')}
        >
          Upcoming
        </button>
        <button
          className={tab === 'past' ? 'on' : ''}
          data-t="past"
          onClick={() => setTab('past')}
        >
          Completed
        </button>
        <button
          className={tab === 'cancel' ? 'on' : ''}
          data-t="cancel"
          onClick={() => setTab('cancel')}
        >
          Cancelled
        </button>
      </div>

      {/* Bookings list */}
      <div id="bl">
        {bookings.length > 0 ? (
          bookings.map((booking, index) => {
            const totalPrice = booking.total_amount_paise / 100;
            const onlinePaid = booking.online_paid_paise / 100;
            const atPickup = totalPrice - onlinePaid;

            // Calculate countdown for confirmed bookings
            let countdown = '';
            if (booking.status === 'confirmed' && booking.start_date) {
              const startDate = new Date(booking.start_date);
              const now = new Date();
              const diffTime = startDate - now;
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              countdown = diffDays > 0 ? `${diffDays} days` : 'Today';
            }

            return (
              <div
                key={booking.id}
                className="card bkc"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="ic">
                  <CarIcon />
                </div>
                <div>
                  <div className="r" style={{ justifyContent: 'flex-start', gap: '12px' }}>
                    <b style={{ fontSize: '18px' }}>
                      {booking.car?.brand} {booking.car?.model}
                    </b>
                    <span className={`badge ${booking.status}`}>
                      {{
                        confirmed: 'Confirmed',
                        pending: 'Awaiting owner',
                        completed: 'Completed',
                        cancelled: 'Cancelled'
                      }[booking.status] || booking.status}
                    </span>
                  </div>
                  <div className="mut">
                    {formatDate(booking.start_date)} · Pickup in {booking.pickup_location || '—'}
                  </div>
                  {booking.status === 'confirmed' && (
                    <div style={{ marginTop: '8px' }}>
                      Pickup in <span className="cd">{countdown}</span>
                    </div>
                  )}
                  <div className="bar">
                    {/* Progress bar for online paid portion */}
                    <div
                      className="bar-fill"
                      style={{
                        width: `${(onlinePaid / totalPrice) * 100}%`,
                        backgroundColor: 'var(--ink)',
                        height: '100%',
                        borderRadius: '8px',
                      }}
                    />
                  </div>
                  <small className="mut">
                    ₹{onlinePaid.toFixed(0)} paid online · ₹{atPickup.toFixed(0)} at pickup
                  </small>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {tab === 'up' && (
                    <button
                      className="btn o"
                      onClick={() => handleCancel(booking.id)}
                    >
                      Cancel
                    </button>
                  )}
                  {tab !== 'up' && (
                    <button className="btn o">
                      View
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state">
            <p className="mut">Nothing here yet.</p>
          </div>
        )}
      </div>

      {/* Back to search link */}
      <div className="back-link">
        <button className="btn sec" onClick={() => navigate('/')}>
          ← Back to Search
        </button>
      </div>
    </>
  );
}