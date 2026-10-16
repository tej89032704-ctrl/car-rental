import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api.js';

export default function Profile() {
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
  });
  const [subscribers, setSubscribers] = useState({
    email: true,
    sms: true,
    darkMode: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = await api('/auth/me');
        setUser(data.user);
        setForm({
          name: data.user.name || '',
          email: data.user.email || '',
          phone: data.user.phone || '',
          city: data.user.city || '',
        });
        setSubscribers({
          email: data.user.email_notifications || true,
          sms: data.user.sms_notifications || true,
          darkMode: document.documentElement.dataset.theme === 'dark',
        });
        setError('');
      } catch (e) {
        if (String(e.message || '').includes('(401)')) {
          window.location.href = import.meta.env.BASE_URL + 'login';
          return;
        }
        setError(e.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!form.email.trim()) {
      setError('Email is required');
      return;
    }
    if (!form.phone.trim()) {
      setError('Phone number is required');
      return;
    }
    if (!form.city.trim()) {
      setError('City is required');
      return;
    }
    setSaved('');
    try {
      const data = await api('/auth/me', {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          // Note: email and city might not be updatable via this endpoint in the real API
          // We'll assume they are for this example
          email: form.email.trim(),
          city: form.city.trim(),
        },
      });
      setUser(data.user);
      setForm({
        name: data.user.name || '',
        email: data.user.email || '',
        phone: data.user.phone || '',
        city: data.user.city || '',
      });
      setSubscribers({
        email: data.user.email_notifications || true,
        sms: data.user.sms_notifications || true,
        darkMode: document.documentElement.dataset.theme === 'dark',
      });
      setSaved('Profile updated.');
      // Update session
      setSession({ user: data.user });
    } catch (e) {
      setError(e.message || 'Failed to update profile');
    }
  };

  const handleToggleSubscriber = (key) => {
    setSubscribers(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleDarkModeChange = (e) => {
    setSubscribers(prev => ({
      ...prev,
      darkMode: e.target.checked,
    }));
    if (e.target.checked) {
      document.documentElement.dataset.theme = 'dark';
    } else {
      document.documentElement.dataset.theme = 'light';
    }
  };

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading profile…</p>
      </div>
    );
  }

  if (error && !user) {
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
        <span className="header-icon">👤</span>
        <h1>Profile</h1>
        <p className="subtitle">
          Manage your details and preferences.
        </p>
      </div>

      <div className="two" style={{ gridTemplateColumns: '260px 1fr' }}>
        <div className="card sp" style={{ display: 'grid', placeItems: 'center', gap: '10px', textAlign: 'center', alignContent: 'start' }}>
          <div className="avb">{user?.name?.[0] || 'U'}</div>
          <b>{user?.name || 'Unknown'}</b>
          <span className="badge confirmed">Renter</span>
        </div>

        <div className="card">
          <div className="fg">
            {[['Full name', 'name', 'text'], ['Email', 'email', 'email'], ['Phone', 'phone', 'tel'], ['City', 'city', 'text']].map(([label, key, type]) => (
              <label key={key} className="f">
                <input
                  type={type}
                  value={form[key]}
                  placeholder=" "
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <label className="sw">
            Booking alerts by email
            <input
              type="checkbox"
              checked={subscribers.email}
              onChange={() => handleToggleSubscriber('email')}
            />
          </label>
          <label className="sw">
            SMS reminders before pickup
            <input
              type="checkbox"
              checked={subscribers.sms}
              onChange={() => handleToggleSubscriber('sms')}
            />
          </label>
          <label className="sw">
            Dark mode
            <input
              type="checkbox"
              checked={subscribers.darkMode}
              onChange={handleDarkModeChange}
            />
          </label>
          <br />
          <button className="btn" onClick={handleSave}>
            {saved ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Back to search link */}
      <div className="back-link">
        <button className="btn sec" onClick={() => window.location.href = import.meta.env.BASE_URL}>
          ← Back to Search
        </button>
      </div>
    </>
  );
}