import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useNavigate } from 'react-router-dom';

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [extNewEnd, setExtNewEnd] = useState('');
  const [reviewBooking, setReviewBooking] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const res = await api('/bookings/my', { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      } else {
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) { navigate('/login'); return; }
        setError(j.message || `Failed to load (HTTP ${res.status})`);
      }
    } catch (e) {
      setError('Network error — check your connection');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const doCancel = async function(cancelId) {
    if (!cancelReason.trim()) return;
    setActionLoading(cancelId);
    try {
      const res = await api(`/bookings/${cancelId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (res.ok) { setCancelReason(''); load(); }
      else { const j = await res.json(); setError(j.message || 'Cancel failed'); }
    } catch (e) { setError('Network error'); }
    finally { setActionLoading(null); }
  };

  const doExtend = async function(extendId) {
    if (!extNewEnd.trim()) return;
    setActionLoading(extendId);
    try {
      const res = await api(`/bookings/${extendId}/extend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_end_date: extNewEnd }),
      });
      if (res.ok) { setExtNewEnd(''); load(); }
      else { const j = await res.json(); setError(j.message || 'Extension request failed'); }
    } catch (e) { setError('Network error'); }
    finally { setActionLoading(null); }
  };

  const doPay = async function(payId) {
    if (!window.confirm('Pay the 20% online portion now to confirm this booking?')) return;
    setActionLoading(payId);
    try {
      const res = await api(`/bookings/${payId}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });
      if (res.ok) { load(); }
      else { const j = await res.json(); setError(j.message || 'Payment failed'); }
    } catch (e) { setError('Network error'); }
    finally { setActionLoading(null); }
  };

  const doReview = async function() {
    if (!reviewBooking) return;
    setReviewLoading(true);
    try {
      const res = await api('/reviews', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: reviewBooking.id, rating: reviewRating, comment: reviewComment || undefined }),
      });
      if (res.ok) { setReviewBooking(null); setReviewRating(5); setReviewComment(''); load(); }
      else { const j = await res.json(); setError(j.message || 'Review failed'); }
    } catch (e) { setError('Network error'); }
    finally { setReviewLoading(false); }
  };

  const doDispute = async function(disputeId) {
    const reason = window.prompt('Describe the problem (min 5 characters):');
    if (!reason || reason.length < 5) return;
    setActionLoading(disputeId);
    try {
      const res = await api('/disputes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: disputeId, reason }),
      });
      if (res.ok) { load(); }
      else { const j = await res.json(); setError(j.message || 'Dispute raise failed'); }
    } catch (e) { setError('Network error'); }
    finally { setActionLoading(null); }
  };

  if (loading) return (
    <div className="loading-page">
      <div className="spinner"></div>
      <p>Loading your bookings…</p>
    </div>
  );

  if (error && !bookings.length) return (
    <div className="auth-box card">
      <p className="error">{error}</p>
      <button className="btn" onClick={load}>Retry</button>
    </div>
  );

  return (
    <>
      <div className="renter-page-header">
        <span className="header-icon">🧾</span>
        <h1>My Bookings</h1>
        <p className="subtitle">Track your trips, extend stays, leave reviews</p>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button className="btn dismiss" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* Review Modal */}
      {reviewBooking && (
        <div className="modal-overlay" onClick={() => { setReviewBooking(null); setReviewComment(''); setReviewRating(5); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Leave a review for {reviewBooking.car?.brand} {reviewBooking.car?.model}</h3>
            </div>
            <div className="form-group">
              <label className="f">Rating</label>
              <div className="rating rating-lg">
                {[1,2,3,4,5].map((s) => (
                  <button key={s} onClick={() => setReviewRating(s)}
                    className={s <= reviewRating ? 'star' : 'star-empty'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 28 }}>
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="f">Comment (optional)</label>
              <textarea className="f" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3}
                placeholder="How was your experience?" />
            </div>
            <p className="form-hint">Share details about your rental experience</p>
            <div className="modal-actions">
              <button className="btn" onClick={doReview} disabled={reviewLoading}>
                {reviewLoading ? 'Submitting…' : 'Submit Review'}
              </button>
              <button className="btn sec" onClick={() => { setReviewBooking(null); setReviewComment(''); setReviewRating(5); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {!bookings.length ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3>No bookings yet</h3>
          <p>You haven't made any bookings. Browse cars to get started.</p>
          <button className="btn" onClick={() => navigate('/')}>Browse Cars</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {bookings.map((b) => (
            <div key={b.id} className="booking-card">
              <div className="booking-card-header">
                <div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 600, color: '#1e293b' }}>
                    {b.car?.brand} {b.car?.model} <span style={{ color: '#64748b', fontSize: 14, fontWeight: 400 }}>· {b.car?.plate}</span>
                  </h3>
                  <p style={{ margin: '0 0 4px', color: '#64748b', fontSize: 14 }}>{new Date(b.start_date).toLocaleDateString()} — {new Date(b.end_date).toLocaleDateString()}</p>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>Owner: {b.owner?.name || '—'}</p>
                </div>
                <span className={`booking-status status-${b.status}`}>{b.status}</span>
              </div>

              <div className="booking-card-footer">
                <div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>₹{(b.total_amount_paise / 100).toFixed(0)}</span>
                  <span style={{ color: '#94a3b8', fontSize: 13, marginLeft: 6 }}>total</span>
                  <br />
                  <span style={{ color: '#059669', fontSize: 13 }}>Online paid ₹{(b.online_paid_paise / 100).toFixed(0)}</span>
                  <span style={{ color: '#94a3b8', fontSize: 13, marginLeft: 6 }}>· due at pickup ₹{(b.remaining_due_paise / 100).toFixed(0)}</span>
                </div>
                <div className="booking-card-actions">
                  {b.status === 'confirmed' && b.online_paid_paise === 0 && (
                    <button className="btn" onClick={() => doPay(b.id)} disabled={actionLoading === b.id}>
                      {actionLoading === b.id ? 'Processing…' : `Pay online (20%) — ₹${(b.total_amount_paise * 0.2 / 100).toFixed(0)}`}
                    </button>
                  )}
                  {b.status === 'confirmed' && (
                    <button className="btn sec" onClick={() => doExtend(b.id)} disabled={actionLoading === b.id}>
                      {actionLoading === b.id ? '…' : 'Extend'}
                    </button>
                  )}
                  {b.status === 'completed' && (
                    <>
                      {b.has_reviewed ? (
                        <span style={{ color: '#166534', fontSize: 13, fontWeight: 500, padding: '6px 0' }}>✓ Reviewed</span>
                      ) : (
                        <button className="btn" onClick={() => setReviewBooking(b)}>Review Owner</button>
                      )}
                      <button className="btn bad" onClick={() => doDispute(b.id)} disabled={actionLoading === b.id}>Report Problem</button>
                    </>
                  )}
                  {b.status === 'requested' && (
                    <button className="btn sec" onClick={() => { if (window.confirm('Cancel this booking?')) doCancel(b.id); }} disabled={actionLoading === b.id}>
                      {actionLoading === b.id ? '…' : 'Cancel'}
                    </button>
                  )}
                  <button className="btn sec" onClick={() => navigate(`/bookings/${b.id}`)}>View Details</button>
                </div>
              </div>

              <div className="booking-card-timeline">
                {['requested', 'confirmed', 'ongoing', 'completed'].map((step, i) => {
                  const order = ['requested', 'confirmed', 'ongoing', 'completed'];
                  const idx = order.indexOf(b.status);
                  const reached = i <= idx;
                  const active = i === idx;
                  const labels = ['Requested', 'Confirmed', 'Ongoing', 'Completed'];
                  return (
                    <div key={step} className={`timeline-step ${active ? 'active' : ''} ${reached ? 'reached' : ''}`}>
                      <span className="timeline-dot" style={{
                        background: active ? '#1CA9A3' : reached ? '#059669' : '#cbd5e1',
                        boxShadow: active ? '0 0 0 4px rgba(28,169,163,0.18)' : 'none',
                      }} />
                      <span className="timeline-label" style={{ color: active ? '#0f172a' : reached ? '#334155' : '#94a3b8', fontWeight: active ? 700 : 500 }}>{labels[i]}</span>
                      {i < 3 && <span className="timeline-line" style={{ background: i < idx ? '#059669' : '#e2e8f0' }} />}
                    </div>
                  );
                })}
              </div>

              {b.status === 'requested' && (
                <div className="booking-panel cancel-panel">
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Reason for cancellation (optional):</label>
                  <textarea className="f" value={ cancelReason || '' } onChange={ (e) => setCancelReason(e.target.value) } rows={2} placeholder="e.g. Found a better deal, travel plans changed…" />
                </div>
              )}

              {b.status === 'confirmed' && (
                <div className="booking-panel extend-panel">
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Request extension — new end date:</label>
                  <input className="f" type="date" value={extNewEnd} onChange={ (e) => setExtNewEnd(e.target.value) } min={new Date(b.end_date).toISOString().split('T')[0]} />
                  <button className="btn ok" style={{ marginTop: 8 }} onClick={() => doExtend(b.id)} disabled={!extNewEnd.trim() || actionLoading === b.id}>
                    {actionLoading === b.id ? 'Requesting…' : 'Request Extension'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="back-link">
        <button className="btn sec" onClick={() => navigate('/')}>← Back to Search</button>
      </div>
    </>
  );
}
