import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all or unread

  useEffect(() => {
    const loadNotifications = async () => {
      if (!currentUser) return;
      try {
        const data = await api('/notifications/mine');
        setNotifications(Array.isArray(data) ? data : []);
        setError('');
      } catch (e) {
        if (String(e.message || '').includes('(401)')) {
          window.location.href = '/login';
          return;
        }
        setError(e.message || 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };
    loadNotifications();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading notifications…</p>
      </div>
    );
  }

  if (error && !notifications.length) {
    return (
      <div className="auth-box card">
        <p className="error">{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  // Determine which notifications to show based on filter
  let visibleNotifications = [];
  if (filter === 'all') {
    visibleNotifications = notifications;
  } else if (filter === 'unread') {
    visibleNotifications = notifications.filter(n => !n.read);
  }

  return (
    <>
      <div className="renter-page-header">
        <span className="header-icon">🔔</span>
        <h1>Notifications</h1>
        <p className="mut">
          Updates on bookings, payments and verification.
        </p>
      </div>

      <div className="r">
        <div>
          <h1>Notifications</h1>
          <p className="mut">
            Updates on bookings, payments and verification.
          </p>
        </div>
        <button className="btn o" onClick={() => {
          // Mark all as read
          const updatePromises = notifications
            .filter(n => !n.read)
            .map(n => api(`/notifications/${n.id}/read`, { method: 'POST' }));
          Promise.all(updatePromises).then(() => {
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
          });
        }}>
          Mark all read
        </button>
      </div>

      <div className="pills" id="nf">
        <button
          className={filter === 'all' ? 'on' : ''}
          data-f="all"
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={filter === 'unread' ? 'on' : ''}
          data-f="un"
          onClick={() => setFilter('unread')}
        >
          Unread
        </button>
      </div>

      <div id="nl">
        {visibleNotifications.length > 0 ? (
          visibleNotifications.map((n, index) => (
            <div
              key={n.id}
              className={`card nt sp ${n.read ? '' : 'un'}`}
              style={{ animationDelay: `${index * 300}ms` }}
            >
              <div className="ni">{n.icon || '📢'}</div>
              <span>{n.title}</span>
              <time>{new Date(n.created_at).toLocaleString()}</time>
            </div>
          ))
        ) : (
          <p className="mut">You are all caught up.</p>
        )}
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