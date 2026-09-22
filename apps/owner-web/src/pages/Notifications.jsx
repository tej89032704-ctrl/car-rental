import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (currentUser) api('/notifications/mine').then(setItems).catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="wrap">
      <div className="page-header">
        <h1>Notifications</h1>
      </div>
      {err && <div className="alert err">{err}</div>}
      {items.length === 0 && <div className="card"><p className="muted">Nothing here yet.</p></div>}
      {items.length > 0 && (
        <div className="notification-list">
          {items.map((n) => (
            <div className="notification-item" key={n.id}>
              <div className="notification-content">
                <p className="notification-title">{n.title}</p>
                <p className="notification-body">{n.body}</p>
                <p className="notification-time">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
