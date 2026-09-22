import { useState } from 'react';
import { api, setSession } from '../api.js';
import { useNavigate } from 'react-router-dom';

export default function Lifetime() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [price, setPrice] = useState(0);
  const navigate = useNavigate();

  const loadPrice = async function() {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      const s = data.find((s) => s.key === 'renter_lifetime_fee_paise');
      setPrice(s ? s.value_int / 100 : 0);
    } catch {}
  };

  const buy = async function() {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/subscriptions/renter/lifetime', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`✅ Lifetime membership activated! You paid ₹${(price || 0).toFixed(2)}. Enjoy unlimited car rentals forever.`);
        setSession(data);
      } else {
        setMsg(`❌ ${data.message || 'Purchase failed'}`);
      }
    } catch (e) {
      setMsg('❌ Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lifetime-layout">
      <div className="lifetime-header">
        <span className="header-icon">🌟</span>
        <h1>Renter Lifetime Membership</h1>
        <p className="subtitle">Pay once — rent cars forever, no monthly fees</p>
      </div>

      <div className="lifetime-price-card">
        <div className="lifetime-price-row">
          <div>
            <p className="lifetime-price-label">One-time fee</p>
            <p className="lifetime-price-value">₹{price.toFixed(2)}</p>
          </div>
          <div className="lifetime-price-tag">
            <p className="lifetime-price-included">✓ Included forever</p>
            <p className="lifetime-price-note">Unlimited rentals · No monthly sub</p>
          </div>
        </div>
        <div className="feature-list">
          {[
            'Book any car, anytime — no monthly subscription needed',
            'Skip the ₹299/month owner subscription fee',
            'Your lifetime status is saved on your profile permanently',
          ].map((f, i) => (
            <div key={i} className="feature-list-item">
              <span className="check">✓</span> {f}
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <div className={msg.includes('✅') ? 'alert good' : 'alert err'} style={{ textAlign: 'center' }}>
          {msg}
        </div>
      )}

      <button className="btn btn-lifetime" disabled={loading} onClick={buy}>
        {loading ? 'Processing…' : `Activate Lifetime ₹${price.toFixed(2)}`}
      </button>

      <div className="back-link">
        <button className="btn sec" onClick={() => navigate('/')}>← Back to Search</button>
      </div>
    </div>
  );
}
