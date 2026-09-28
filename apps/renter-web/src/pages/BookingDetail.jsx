import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

const STATUS_LABELS = ['requested', 'confirmed', 'ongoing', 'completed'];

export default function BookingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [b, setB] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const res = await api(`/bookings/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
      if (res.ok) { setB(await res.json()); setErr(''); }
      else {
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) { nav('/login'); return; }
        setErr(j.message || `Failed to load (HTTP ${res.status})`);
      }
    } catch (e) { setErr('Network error — check your connection'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const doPay = async () => {
    setBusy(true); setMsg('');
    try {
      const res = await api(`/bookings/${id}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });
      if (res.ok) {
        const j = await res.json();
        setMsg(`Payment successful — ₹${(j.online_paid_paise / 100).toFixed(0)} paid online${j.invoice_number ? ` (invoice ${j.invoice_number})` : ''}.`);
        load();
      } else { const j = await res.json(); setErr(j.message || 'Payment failed'); }
    } catch (e) { setErr('Network error'); }
    finally { setBusy(false); }
  };

  const doCancel = async () => {
    if (!window.confirm('Cancel this booking?')) return;
    setBusy(true);
    try {
      const res = await api(`/bookings/${id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled from booking details' }),
      });
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j && typeof j.refund_amount_paise === 'number' && typeof j.penalty_amount_paise === 'number') {
          const parts = [`Booking cancelled (${j.message}).`];
          if (j.refund_amount_paise > 0) parts.push(`Refund ₹${(j.refund_amount_paise / 100).toFixed(0)} to your wallet`);
          if (j.penalty_amount_paise > 0) parts.push(`₹${(j.penalty_amount_paise / 100).toFixed(0)} retained as cancellation fee`);
          setMsg(parts.join(' '));
        } else setMsg('Booking cancelled.');
        load();
      }
      else { const j = await res.json(); setErr(j.message || 'Cancel failed'); }
    } catch (e) { setErr('Network error'); }
    finally { setBusy(false); }
  };

  if (loading) return (
    <div className="loading-page">
      <div className="spinner"></div>
      <p>Loading booking…</p>
    </div>
  );

  if (err && !b) return (
    <div className="auth-box card">
      <p className="error">{err}</p>
      <button className="btn" onClick={nav('/bookings')}>Back to bookings</button>
    </div>
  );

  if (!b) return <p className="muted">No booking found.</p>;

  const idx = STATUS_LABELS.indexOf(b.status) >= 0 ? STATUS_LABELS.indexOf(b.status) : -1;

  return (
    <>
      <div className="renter-page-header">
        <span className="header-icon">🚗</span>
        <h1>{b.car?.brand} {b.car?.model}</h1>
        <p className="subtitle">{b.car?.plate} · Booking {b.id.slice(0, 8)} · <b>{b.status}</b></p>
      </div>

      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="card">
        <div className="car-detail-layout">
          {b.car?.image_url ? (
            <img className="car-detail-img" src={b.car.image_url} alt="" style={{ objectFit: 'cover' }} />
          ) : (
            <img className="car-detail-img" src="https://via.placeholder.com/400x220" alt="" />
          )}
          <div className="car-detail-info">
            <p className="muted" style={{ marginTop: 0 }}>
              {new Date(b.start_date).toLocaleDateString()} → {new Date(b.end_date).toLocaleDateString()}
            </p>
            {b.owner && <p className="muted">Owner: <b>{b.owner.name}</b> {b.owner.phone ? `· ${b.owner.phone}` : ''}</p>}
            <p className="muted">₹{(b.car?.price_paise_per_day || 0) / 100}/day · {b.car?.category}</p>
            <div className="amount-summary" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 320 }}>
                <span className="muted">Total rental</span><b>₹{(b.total_amount_paise / 100).toFixed(0)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 320 }}>
                <span className="muted">Online paid</span><b style={{ color: '#1d1d1f' }}>₹{(b.online_paid_paise / 100).toFixed(0)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 320 }}>
                <span className="muted">Due at pickup (cash)</span><b>₹{(b.remaining_due_paise / 100).toFixed(0)}</b>
              </div>
              {b.security_deposit_paise > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 320 }}>
                  <span className="muted">Security deposit (refundable)</span><b>₹{(b.security_deposit_paise / 100).toFixed(0)}</b>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Trip status</h2>
        <div className="booking-card-timeline" style={{ borderTop: 'none', paddingTop: 0 }}>
          {STATUS_LABELS.map((step, i) => {
            const reached = idx >= 0 && i <= idx;
            const active = i === idx;
            return (
              <div key={step} className={`timeline-step ${active ? 'active' : ''} ${reached ? 'reached' : ''}`}>
                <span className="timeline-dot" style={{
                  background: active ? '#1d1d1f' : reached ? '#6e6e73' : '#d2d2d7',
                  boxShadow: active ? '0 0 0 4px rgba(0,0,0,0.12)' : 'none',
                }} />
                <span className="timeline-label" style={{ color: active ? '#1d1d1f' : reached ? '#333336' : '#86868b', fontWeight: active ? 700 : 500, textTransform: 'capitalize' }}>{step}</span>
                {i < 3 && <span className="timeline-line" style={{ background: i < idx ? '#1d1d1f' : '#e8e8ed' }} />}
              </div>
            );
          })}
        </div>

        {b.status === 'confirmed' && (
          <div className="alert info" style={{ marginTop: 14 }}>
            The owner approved your booking. <b>Pay the 20% online portion</b> to lock it in — the remaining amount is paid to the owner at pickup.
          </div>
        )}
        {b.status === 'requested' && (
          <div className="alert info" style={{ marginTop: 14 }}>
            Waiting for the owner to approve your request.
          </div>
        )}
        {b.status === 'ongoing' && (
          <div className="alert good" style={{ marginTop: 14 }}>
            Trip in progress. Drive safe! 🛣️
          </div>
        )}
        {b.status === 'completed' && (
          <div className="alert good" style={{ marginTop: 14 }}>
            Trip completed. Thanks for driving with CAR-ENT!
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          {b.status === 'confirmed' && b.online_paid_paise === 0 && (
            <button className="btn" onClick={doPay} disabled={busy}>
              {busy ? 'Processing…' : `Pay online (20%) — ₹${(b.total_amount_paise * 0.2 / 100).toFixed(0)}`}
            </button>
          )}
          {b.status === 'requested' && (
            <button className="btn bad" onClick={doCancel} disabled={busy}>Cancel booking</button>
          )}
          <button className="btn sec" onClick={() => nav('/bookings')}>← Back to My Bookings</button>
        </div>
      </div>
    </>
  );
}