import { useState, useEffect } from 'react';
import { api, setSession } from '../api.js';
import { useNavigate } from 'react-router-dom';
import { RatingSummary, ReviewComments } from '../../../../packages/shared/src/Reviews.jsx';

export default function Requests() {
  const [requests, setRequests] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [reviewBooking, setReviewBooking] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const navigate = useNavigate();

  // shared api() returns parsed data and throws Error(message) on failure;
  // it attaches Authorization itself, so no headers option here.
  const load = async () => {
    try {
      const [reqData, extData, compData] = await Promise.all([
        api('/bookings/requests'),
        api('/extensions'),
        api('/bookings/completed'),
      ]);
      setRequests(Array.isArray(reqData) ? reqData : []);
      setExtensions(Array.isArray(extData) ? extData : []);
      setCompleted(Array.isArray(compData) ? compData : []);
      setError('');
    } catch (e) {
      if (String(e.message || '').includes('(401)')) { navigate('/login'); return; }
      setError(e.message || 'Network error — check your connection');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const doDecide = async function(id, decision) {
    setActionLoading(id);
    try {
      await api(`/bookings/${id}/decide`, { method: 'POST', body: { decision } });
      load();
    } catch (e) { setError(e.message || 'Decide failed'); }
    finally { setActionLoading(null); }
  };

  const doStartTrip = async function(id) {
    setActionLoading(id);
    try {
      await api(`/bookings/${id}/start-trip`, { method: 'POST' });
      load();
    } catch (e) { setError(e.message || 'Start trip failed'); }
    finally { setActionLoading(null); }
  };

  const doComplete = async function(id) {
    setActionLoading(id);
    try {
      await api(`/bookings/${id}/complete`, { method: 'POST' });
      load();
    } catch (e) { setError(e.message || 'Complete trip failed'); }
    finally { setActionLoading(null); }
  };

  const doExtensionDecide = async function(id, decision) {
    setActionLoading(id);
    try {
      await api(`/extensions/${id}/decide`, { method: 'POST', body: { decision } });
      load();
    } catch (e) { setError(e.message || 'Extension decision failed'); }
    finally { setActionLoading(null); }
  };

  const doDispute = async function(id) {
    const reason = window.prompt('Describe the issue (min 5 characters):');
    if (!reason || reason.length < 5) return;
    setActionLoading(id);
    try {
      await api('/disputes', { method: 'POST', body: { booking_id: id, reason } });
      load();
    } catch (e) { setError(e.message || 'Dispute raise failed'); }
    finally { setActionLoading(null); }
  };

  const doReview = async function() {
    if (!reviewBooking) return;
    setReviewLoading(true);
    try {
      await api('/reviews/renter', {
        method: 'POST',
        body: { booking_id: reviewBooking.id, rating: reviewRating, comment: reviewComment || undefined },
      });
      setReviewBooking(null); setReviewRating(5); setReviewComment(''); load();
    } catch (e) { setError(e.message || 'Review failed'); }
    finally { setReviewLoading(false); }
  };

  if (loading) return <div className="loading-page"><div className="spinner"></div><p>Loading requests…</p></div>;
  if (error && !requests.length && !extensions.length && !completed.length) return <div className="wrap"><div className="alert err">{error}</div><button className="btn" onClick={load}>Retry</button></div>;

  return (
    <div className="wrap owner-page">
      <div className="page-header">
        <h1>Booking Requests</h1>
        <p className="subtitle">Manage requests, start trips, handle extensions, review renters</p>
      </div>

      {error && <div className="alert err">{error}<button className="btn btn-ghost btn-sm ml-8" onClick={() => setError('')}>Dismiss</button></div>}

      {/* Review Modal */}
      {reviewBooking && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Review renter for {reviewBooking.car?.brand} {reviewBooking.car?.model}</h3>
            </div>
            <div className="form-group">
              <label className="f">Rating</label>
              <div className="star-rating">
                {[1,2,3,4,5].map((s) => (
                  <button key={s} onClick={() => setReviewRating(s)} className={s <= reviewRating ? 'filled' : ''}>★</button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="f">Comment (optional)</label>
              <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3}
                className="f review-form"
                placeholder="How was this renter?" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-review" onClick={doReview} disabled={reviewLoading}>
                {reviewLoading ? 'Submitting…' : 'Submit Review'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setReviewBooking(null); setReviewComment(''); setReviewRating(5); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Pending Booking Requests ---------- */}
      <h2 className="page-section-title">⚡ Pending Requests</h2>
      {!requests.length ? (
        <div className="empty-state-section">
          <div className="empty-icon">✅</div>
          <p>No pending requests — you're all caught up</p>
        </div>
      ) : (
        <div className="booking-list mb-28">
          {requests.map((r) => (
            <div key={r.id} className="booking-card">
              <div className="booking-card-header">
                <div className="booking-card-body">
                  <h3>{r.car?.brand} {r.car?.model} <span className="muted">({r.car?.plate})</span></h3>
                  <p>{new Date(r.start_date).toLocaleDateString()} → {new Date(r.end_date).toLocaleDateString()}</p>
                  <p className="meta-accent">Requested by {r.renter?.name || r.renter_id} · ₹{(r.total_amount_paise / 100).toFixed(2)}</p>
                  <div className="requester-trust">
                    <RatingSummary avg={r.renter?.avg_rating} count={r.renter?.total_reviews} emptyText="New renter — no reviews yet" />
                    <span className="requester-label">Renter rating &amp; comments</span>
                  </div>
                  <ReviewComments comments={r.renter?.recent_comments} />
                </div>
                <span className="booking-status pill requested">{r.status}</span>
              </div>
              <div className="booking-card-footer">
                <div className="booking-card-actions">
                  {r.status === 'requested' && (
                    <>
                      <button className="btn btn-approve" onClick={() => doDecide(r.id, 'approve')} disabled={actionLoading === r.id}>Approve</button>
                      <button className="btn btn-reject" onClick={() => doDecide(r.id, 'reject')} disabled={actionLoading === r.id}>Reject</button>
                    </>
                  )}
                  {r.status === 'confirmed' && (
                    <button className="btn btn-start" onClick={() => doStartTrip(r.id)} disabled={actionLoading === r.id}>Start Trip</button>
                  )}
                  {r.status === 'ongoing' && (
                    <button className="btn btn-complete" onClick={() => doComplete(r.id)} disabled={actionLoading === r.id}>Complete</button>
                  )}
                  <button className="btn btn-ghost btn-reject" onClick={() => doDispute(r.id)} disabled={actionLoading === r.id}>Report Issue</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Extensions ---------- */}
      <h2 className="page-section-title">🕐 Extension Requests</h2>
      {!extensions.length ? (
        <div className="empty-state-section">
          <div className="empty-icon">📅</div>
          <p>No extension requests pending</p>
        </div>
      ) : (
        <div className="booking-list mb-28">
          {extensions.map((ext) => (
            <div key={ext.id} className="booking-card">
              <div className="booking-card-header">
                <div className="booking-card-body">
                  <h3>{ext.car?.brand} {ext.car?.model} <span className="muted">({ext.car?.plate})</span></h3>
                  <p>Extension: +{ext.additional_days} day(s) → {new Date(ext.requested_end_date).toLocaleDateString()}</p>
                  <p className="meta-accent">Renter: {ext.renter_id} · +₹{(ext.additional_amount_paise / 100).toFixed(2)}</p>
                </div>
                <span className="booking-status pill requested">{ext.status}</span>
              </div>
              <div className="booking-card-footer">
                <div className="booking-card-actions">
                  <button className="btn btn-approve" onClick={() => doExtensionDecide(ext.id, 'approve')} disabled={actionLoading === ext.id}>Approve</button>
                  <button className="btn btn-reject" onClick={() => doExtensionDecide(ext.id, 'reject')} disabled={actionLoading === ext.id}>Reject</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Completed Trips ---------- */}
      <h2 className="page-section-title">✅ Completed Trips</h2>
      {!completed.length ? (
        <div className="empty-state-section">
          <div className="empty-icon">🚗</div>
          <p>No completed trips yet</p>
        </div>
      ) : (
        <div className="booking-list">
          {completed.map((c) => (
            <div key={c.id} className="booking-card">
              <div className="booking-card-header">
                <div className="booking-card-body">
                  <h3>{c.car?.brand} {c.car?.model} <span className="muted">({c.car?.plate})</span></h3>
                  <p>{new Date(c.start_date).toLocaleDateString()} → {new Date(c.end_date).toLocaleDateString()}</p>
                  <p className="meta-accent">Renter: {c.renter?.name || c.renter_id} · ₹{(c.total_amount_paise / 100).toFixed(2)}</p>
                  <RatingSummary avg={c.renter?.avg_rating} count={c.renter?.total_reviews} emptyText="No reviews for this renter yet" />
                </div>
                <span className="booking-status pill completed">completed</span>
              </div>
              <div className="booking-card-footer">
                <div className="booking-card-actions">
                  {c.has_reviewed ? (
                    <span className="pill active">✓ Reviewed</span>
                  ) : (
                    <button className="btn btn-review" onClick={() => setReviewBooking(c)}>
                      Review Renter
                    </button>
                  )}
                  <button className="btn btn-ghost btn-reject" onClick={() => doDispute(c.id)} disabled={actionLoading === c.id}>Report Issue</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center mt-32">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>← Back to Cars</button>
      </div>
    </div>
  );
}
