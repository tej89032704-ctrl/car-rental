import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { RcVerifyBlock, verificationPillClass } from '../../../../packages/shared/src/RcVerify.jsx';
import { Stars, RatingSummary } from '../../../../packages/shared/src/Reviews.jsx';

export default function CarEditor() {
  const { id } = useParams();
  const [car, setCar] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [pricing, setPricing] = useState({ daily_rate_paise: '', weekly_rate_paise: '', monthly_rate_paise: '', security_deposit_paise: '0' });
  const [blockDate, setBlockDate] = useState('');
  const [avail, setAvail] = useState([]);
  const [verify, setVerify] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [carReviews, setCarReviews] = useState(null);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  async function load() {
    try {
      const c = await api(`/cars/${id}`);
      setCar(c);
      if (c.pricing) setPricing({
        daily_rate_paise: c.pricing.daily_rate_paise / 100,
        weekly_rate_paise: c.pricing.weekly_rate_paise ? c.pricing.weekly_rate_paise / 100 : '',
        monthly_rate_paise: c.pricing.monthly_rate_paise ? c.pricing.monthly_rate_paise / 100 : '',
        security_deposit_paise: (c.pricing.security_deposit_paise || 0) / 100,
      });
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
      setAvail(await api(`/cars/${id}/availability?from=${from}&to=${to}`));
      setVerify(await api(`/cars/${id}/verification`).catch(() => null));
    } catch (e) {
      setErr(e.message);
    }

    // Reviews are cosmetic — a failure here must not blank the page.
    try {
      setCarReviews(await api(`/cars/${id}/reviews`));
    } catch {
      setCarReviews({ reviews: [], avg_rating: 0, total_reviews: 0 });
    } finally {
      setReviewsLoading(false);
    }
  }
  useEffect(() => { load(); }, [id]);

  async function act(fn) {
    setErr(''); setMsg('');
    try { const r = await fn(); if (r?.message) setMsg(r.message); load(); } catch (e) { setErr(e.message); }
  }

  async function runVerify() {
    setErr(''); setMsg('');
    setVerifying(true);
    try {
      const r = await api(`/cars/${id}/verify`, { method: 'POST' });
      setVerifyResult(r);
      setMsg(r.message || (r.live ? 'Live RC check complete' : 'RC check complete (demo mode)'));
      load();
    } catch (e) { setErr(e.message); } finally { setVerifying(false); }
  }

  if (!car) return err ? <div className="alert err">{err}</div> : <p className="muted">Loading…</p>;

  return (
    <div className="wrap">
      <div className="page-header-row">
        <h1>{car.make} {car.model} <span className="muted fw-normal">{car.plate_number}</span></h1>
        <span className={`pill ${car.status} h-fit`}>{car.status}</span>
      </div>
      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}
      {car.rejection_reason && <div className="alert err">Rejected: {car.rejection_reason}</div>}

      <div className="card">
        <h2>Photos ({car.photos.length}/4 minimum)</h2>
        <div className="photo-grid">
          {car.photos.map((p) => <img key={p.id} src={p.file_url} className="photo-thumb" />)}
        </div>
        <div className="form-group mt-10">
          <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && act(() => api(`/cars/${id}/photos`, { method: 'POST', form: (() => { const fd = new FormData(); for (const f of e.target.files) fd.append('files', f); return fd; })() }))} />
        </div>
      </div>

      <div className="card">
        <h2>Documents</h2>
        {['rc_book', 'insurance'].map((t) => (
          <div key={t} className="info-row">
            <span className="info-label">{t.replace('_', ' ')}</span>
            <input type="file" onChange={(e) => e.target.files[0] && act(() => api(`/cars/${id}/documents`, { method: 'POST', form: (() => { const fd = new FormData(); fd.append('doc_type', t); fd.append('file', e.target.files[0]); return fd; })() }))} />
          </div>
        ))}
      </div>

      <div className="card">
        <h2>RC verification</h2>
        <p>
          Status: <span className={`pill ${verificationPillClass(car.verification_status)} h-fit`}>{car.verification_status}</span>
          {car.verified_at && <span className="muted" style={{ marginLeft: 8 }}>verified {new Date(car.verified_at).toLocaleDateString()}</span>}
        </p>
        <p className="muted">RC details are checked against the RTO (VAHAN) database before a car can go live. You can self-check anytime; the super admin re-checks at approval.</p>
        {(verifyResult || verify?.history?.[0]) && <RcVerifyBlock v={verifyResult || verify.history[0]} />}
        <div className="verify-actions" style={{ marginTop: 10 }}>
          <button className="btn sm" disabled={verifying} onClick={runVerify}>
            {verifying ? 'Checking RTO…' : car.verification_status === 'verified' ? 'Re-verify RC' : 'Run RC verification'}
          </button>
          {!verifyResult?.live && !verify?.history?.[0]?.live && <span className="muted">Demo mode — no live RTO key configured yet.</span>}
        </div>
      </div>

      <div className="card">
        <h2>Pricing (₹ per period)</h2>
        <div className="row">
          <div className="form-group"><label className="f">Daily *</label><input className="f" type="number" value={pricing.daily_rate_paise} onChange={(e) => setPricing({ ...pricing, daily_rate_paise: e.target.value })} /></div>
          <div className="form-group"><label className="f">Weekly</label><input className="f" type="number" value={pricing.weekly_rate_paise} onChange={(e) => setPricing({ ...pricing, weekly_rate_paise: e.target.value })} /></div>
          <div className="form-group"><label className="f">Monthly</label><input className="f" type="number" value={pricing.monthly_rate_paise} onChange={(e) => setPricing({ ...pricing, monthly_rate_paise: e.target.value })} /></div>
          <div className="form-group"><label className="f">Deposit</label><input className="f" type="number" value={pricing.security_deposit_paise} onChange={(e) => setPricing({ ...pricing, security_deposit_paise: e.target.value })} /></div>
        </div>
        <br />
        <button className="btn sm" onClick={() => act(() => api(`/cars/${id}/pricing`, {
          method: 'PUT',
          body: {
            daily_rate_paise: Math.round(pricing.daily_rate_paise * 100),
            ...(pricing.weekly_rate_paise ? { weekly_rate_paise: Math.round(pricing.weekly_rate_paise * 100) } : {}),
            ...(pricing.monthly_rate_paise ? { monthly_rate_paise: Math.round(pricing.monthly_rate_paise * 100) } : {}),
            security_deposit_paise: Math.round((pricing.security_deposit_paise || 0) * 100),
          },
        }))}>Save pricing</button>
      </div>

      <div className="card">
        <h2>Block dates</h2>
        <p className="muted">Maintenance or personal use — blocked days can't be booked.</p>
        <div className="photo-grid">
          <input className="f max-w-200" type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />
          <button className="btn warn sm" onClick={() => blockDate && act(() => api(`/cars/${id}/availability`, { method: 'PUT', body: { dates: [blockDate], is_available: false, reason: 'Blocked by owner' } }))}>Block</button>
          <button className="btn ok sm" disabled={!avail.some((a) => !a.is_available)}
            onClick={() => act(() => api(`/cars/${id}/availability`, { method: 'PUT', body: { dates: avail.filter((a) => !a.is_available).map((a) => a.date), is_available: true } }))}>Unblock all shown</button>
        </div>
        <div className="table-wrap mt-12">
          <table className="t">
            <thead><tr><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {avail.map((a) => (
                <tr key={a.date}><td>{a.date}</td><td>{a.is_available ? <span className="pill active">available</span> : <span className="pill cancelled">blocked</span>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reviews section */}
      <div className="card">
        <h2>Reviews</h2>
        {reviewsLoading || !carReviews ? <p className="muted">Loading reviews…</p> : carReviews.reviews.length === 0 ? (
          <p className="muted">No reviews yet.</p>
        ) : (
          <>
            <div className="rating-summary">
              <RatingSummary avg={carReviews.avg_rating} count={carReviews.total_reviews} emptyText="No reviews yet" />
            </div>
            <div className="review-list">
              {carReviews.reviews.map((rev) => (
                <div key={rev.id} className="review-card">
                  <div className="review-card-header">
                    <span className="review-card-name">{rev.reviewer_name}</span>
                    <span className="rating">
                      <Stars value={rev.rating} />
                    </span>
                  </div>
                  {rev.comment && <p className="review-card-comment">{rev.comment}</p>}
                  {rev.created_at && <p className="review-card-date">{new Date(rev.created_at).toLocaleDateString()}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {['draft', 'rejected'].includes(car.status) && (
        <button className="btn" onClick={() => act(() => api(`/cars/${id}/submit`, { method: 'POST' }))}>
          Submit for review
        </button>
      )}
    </div>
  );
}