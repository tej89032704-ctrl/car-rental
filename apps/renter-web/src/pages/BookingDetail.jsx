import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import CarArt from '../components/CarArt.jsx';
import BookingChat from '../../../../packages/shared/src/BookingChat.jsx';
import { carTitle, day, inr, paintFor, toast, uprightFor } from '../components/ui.js';

const STEPS = [
  { key: 'requested', label: 'Request sent', text: 'The owner reviews your dates.' },
  { key: 'confirmed', label: 'Owner approved', text: 'Pay the 20% online to lock it in.' },
  { key: 'ongoing', label: 'On the road', text: 'Pick up the car and drive.' },
  { key: 'completed', label: 'Completed', text: 'Settled at pickup. Leave a review.' },
];

const STATUS_LABEL = {
  requested: 'Awaiting owner',
  confirmed: 'Confirmed',
  ongoing: 'On the road',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function BookingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [b, setB] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [showExt, setShowExt] = useState(false);
  const [extDate, setExtDate] = useState('');
  const [showDisp, setShowDisp] = useState(false);
  const [dispReason, setDispReason] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  async function load() {
    try {
      const data = await api(`/bookings/${id}`);
      setB(data);
      if (data?.end_date) {
        const next = new Date(new Date(data.end_date).getTime() + 86400000);
        setExtDate(next.toISOString().slice(0, 10));
      }
      setErr('');
    } catch (e) {
      setErr(e.message || 'Could not load this booking');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function pay() {
    setBusy(true);
    setMsg('');
    try {
      const j = await api(`/bookings/${id}/pay`, { method: 'POST' });
      setMsg(`Payment successful — ${inr(j.online_paid_paise)} paid online${j.invoice_number ? ` (invoice ${j.invoice_number})` : ''}.`);
      toast('Online payment received');
      await load();
    } catch (e) {
      setErr(e.message || 'Payment failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitExtension(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api(`/bookings/${id}/extend`, { method: 'POST', body: { new_end_date: extDate } });
      toast('Extension requested. Awaiting owner approval.');
      setMsg('Trip extension requested. The owner will review your extra days.');
      setShowExt(false);
      await load();
    } catch (e2) {
      setErr(e2.message || 'Extension request failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitDispute(e) {
    e.preventDefault();
    if (dispReason.trim().length < 5) {
      setErr('Please provide a reason of at least 5 characters.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      await api('/disputes', { method: 'POST', body: { booking_id: id, reason: dispReason.trim() } });
      toast('Dispute submitted. Admin will review.');
      setMsg('Dispute has been raised. A platform administrator will review it.');
      setShowDisp(false);
      await load();
    } catch (e2) {
      setErr(e2.message || 'Could not submit dispute');
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api('/reviews', { method: 'POST', body: { booking_id: id, rating: reviewRating, comment: reviewComment.trim() || undefined } });
      toast('Thank you for rating!');
      setMsg('Review submitted. Thanks for your feedback!');
      setShowReview(false);
      await load();
    } catch (e2) {
      setErr(e2.message || 'Could not submit review');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setShowCancel(false);
    try {
      const j = await api(`/bookings/${id}/cancel`, { method: 'POST', body: { reason: 'Cancelled from booking details' } });
      const parts = [`Booking cancelled (${j.message}).`];
      if (j.refund_amount_paise > 0) parts.push(`${inr(j.refund_amount_paise)} refunded to your wallet.`);
      if (j.penalty_amount_paise > 0) parts.push(`${inr(j.penalty_amount_paise)} retained as a cancellation fee.`);
      setMsg(parts.join(' '));
      await load();
    } catch (e) {
      setErr(e.message || 'Cancel failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <section className="pg"><div className="ce-load"><span className="spinner" /><span>Loading booking…</span></div></section>;
  }

  if (!b) {
    return (
      <section className="pg">
        <div className="ce-err">{err || 'Booking not found'}</div>
        <button className="gh" type="button" onClick={() => nav('/bookings')}>Back to bookings</button>
      </section>
    );
  }

  const idx = STEPS.findIndex((s) => s.key === b.status);
  const cancelled = b.status === 'cancelled';

  return (
    <section className="pg">
      <button type="button" className="ce-back" onClick={() => nav('/bookings')}>← Back to bookings</button>

      <div className="hd">
        <div>
          <div className="ey">Booking {String(b.id).slice(0, 8)}</div>
          <h1>{carTitle(b.car)}</h1>
          <p>{b.car?.plate ? `${b.car.plate} · ` : ''}{STATUS_LABEL[b.status] || b.status}</p>
        </div>
      </div>

      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="ce-err">{err}</div>}

      <div className="panel tk">
        <div className="pic">
          {b.car?.image_url
            ? <img src={b.car.image_url} alt={carTitle(b.car)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <CarArt accent={paintFor({ id: b.car_id, category: b.car?.category })} upright={uprightFor(b.car)} />}
        </div>
        <div className="in">
          <span className={`stt ${cancelled ? 'e' : b.status === 'requested' ? 'w' : ''}`}>
            {STATUS_LABEL[b.status] || b.status}
          </span>
          <h2 style={{ marginTop: 12 }}>{b.car?.brand} {b.car?.model}</h2>
          <div className="kv">
            <div><small>Pick-up</small><b>{day(b.start_date)}</b></div>
            <div><small>Return</small><b>{day(b.end_date)}</b></div>
            <div><small>Total rental</small><b>{inr(b.total_amount_paise)}</b></div>
            <div><small>Paid online</small><b>{inr(b.online_paid_paise)}</b></div>
            <div><small>Due at pickup</small><b>{inr(b.remaining_due_paise)}</b></div>
            {b.security_deposit_paise > 0 && <div><small>Refundable deposit</small><b>{inr(b.security_deposit_paise)}</b></div>}
            {b.owner?.name && <div><small>Host</small><b>{b.owner.name}</b></div>}
          </div>
          <div className="ce-form-actions" style={{ marginTop: 0, flexWrap: 'wrap', gap: 10 }}>
            {b.status === 'confirmed' && !b.online_paid_paise && (
              <button className="go" type="button" disabled={busy} onClick={pay} style={{ margin: 0 }}>
                {busy ? 'Processing…' : `Pay online (20%) — ${inr(Math.round(b.total_amount_paise * 0.2))}`}
              </button>
            )}
            {['confirmed', 'ongoing'].includes(b.status) && (
              <>
                <button className="gh" type="button" onClick={() => { setShowExt(!showExt); setShowDisp(false); }}>
                  {showExt ? 'Cancel extension' : 'Extend trip'}
                </button>
                <button className="gh" type="button" onClick={() => { setShowDisp(!showDisp); setShowExt(false); }}>
                  {showDisp ? 'Cancel dispute' : 'Raise dispute'}
                </button>
              </>
            )}
            {b.status === 'completed' && (
              <button className="go" type="button" onClick={() => setShowReview(!showReview)} style={{ margin: 0 }}>
                {showReview ? 'Cancel review' : 'Leave a review'}
              </button>
            )}
            {['requested', 'confirmed', 'ongoing'].includes(b.status) && (
              <button className="gh" type="button" disabled={busy} onClick={() => { setShowCancel(true); setShowExt(false); setShowDisp(false); setShowReview(false); }} style={{ color: 'var(--er)' }}>
                Cancel booking
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18, padding: 22 }}>
        <BookingChat key={id} bookingId={id} otherLabel="owner" />
      </div>

      {showExt && (
        <form className="panel fm" onSubmit={submitExtension} style={{ marginTop: 18, padding: 22 }}>
          <h3>Request trip extension</h3>
          <p className="muted" style={{ margin: '4px 0 16px' }}>Choose a new end date. The car host must approve the extra days.</p>
          <div className="f">
            <label htmlFor="ext-end">New drop-off date</label>
            <input id="ext-end" type="date" required value={extDate}
              min={b?.end_date ? new Date(new Date(b.end_date).getTime() + 86400000).toISOString().slice(0, 10) : undefined}
              onChange={(e) => setExtDate(e.target.value)} />
          </div>
          <div className="ce-form-actions" style={{ marginTop: 12 }}>
            <button className="go" type="submit" disabled={busy}>Submit extension request</button>
            <button className="gh" type="button" onClick={() => setShowExt(false)}>Close</button>
          </div>
        </form>
      )}

      {showDisp && (
        <form className="panel fm" onSubmit={submitDispute} style={{ marginTop: 18, padding: 22 }}>
          <h3>Raise a dispute</h3>
          <p className="muted" style={{ margin: '4px 0 16px' }}>Tell us what went wrong. Platform administrators will investigate the booking.</p>
          <div className="f w">
            <label htmlFor="disp-r">Reason for dispute</label>
            <textarea id="disp-r" rows={3} required value={dispReason} onChange={(e) => setDispReason(e.target.value)} placeholder="Explain the issue in detail…" />
          </div>
          <div className="ce-form-actions" style={{ marginTop: 12 }}>
            <button className="go" type="submit" disabled={busy} style={{ background: 'var(--er)' }}>Submit dispute</button>
            <button className="gh" type="button" onClick={() => setShowDisp(false)}>Close</button>
          </div>
        </form>
      )}

      {showReview && (
        <form className="panel fm" onSubmit={submitReview} style={{ marginTop: 18, padding: 22 }}>
          <h3>Rate your trip</h3>
          <p className="muted" style={{ margin: '4px 0 16px' }}>Share your experience with this vehicle and host.</p>
          <div className="f">
            <label>Rating (1 to 5 stars)</label>
            <select value={reviewRating} onChange={(e) => setReviewRating(Number(e.target.value))}>
              <option value={5}>★★★★★ (5 - Excellent)</option>
              <option value={4}>★★★★☆ (4 - Good)</option>
              <option value={3}>★★★☆☆ (3 - Average)</option>
              <option value={2}>★★☆☆☆ (2 - Poor)</option>
              <option value={1}>★☆☆☆☆ (1 - Terrible)</option>
            </select>
          </div>
          <div className="f w">
            <label htmlFor="rev-c">Feedback comment</label>
            <textarea id="rev-c" rows={3} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="How was the vehicle condition, cleanliness, and handover?" />
          </div>
          <div className="ce-form-actions" style={{ marginTop: 12 }}>
            <button className="go" type="submit" disabled={busy}>Submit review</button>
            <button className="gh" type="button" onClick={() => setShowReview(false)}>Close</button>
          </div>
        </form>
      )}

      {showCancel && (
        <div className="panel fm" style={{ marginTop: 18, padding: 22, border: '1px solid var(--er, #ef4444)' }}>
          <h3 style={{ color: 'var(--er, #ef4444)' }}>Cancel this booking?</h3>
          <p className="muted" style={{ margin: '8px 0 14px' }}>Refund policy based on how far in advance you cancel:</p>
          <ul style={{ paddingLeft: 20, margin: '0 0 18px', lineHeight: 1.8 }}>
            <li><b>More than 24 h before pickup</b> — full refund of the online payment</li>
            <li><b>1 h to 24 h before pickup</b> — 50% refund of the online payment</li>
            <li><b>Less than 1 h before pickup or trip started</b> — no refund</li>
          </ul>
          <div className="ce-form-actions" style={{ marginTop: 0 }}>
            <button className="gh" type="button" disabled={busy} onClick={cancel} style={{ color: 'var(--er, #ef4444)' }}>
              {busy ? 'Cancelling…' : 'Yes, cancel booking'}
            </button>
            <button className="gh" type="button" onClick={() => setShowCancel(false)}>Keep booking</button>
          </div>
        </div>
      )}

      {!cancelled && (
        <div className="panel vs" style={{ marginTop: 22 }}>
          {STEPS.map((s, i) => {
            const reached = idx >= 0 && i <= idx;
            return (
              <div key={s.key}>
                <i className={reached ? 'd' : ''}>{reached ? '✓' : i + 1}</i>
                <div>
                  <h3>{s.label}</h3>
                  <p>{s.text}</p>
                </div>
                {i === idx ? <span className="stt">Here now</span> : null}
              </div>
            );
          })}
        </div>
      )}

      {cancelled && (
        <div className="alert info" style={{ marginTop: 22 }}>
          This trip was cancelled. Any refund lands in your wallet; the car is back in the fleet.
        </div>
      )}
    </section>
  );
}
