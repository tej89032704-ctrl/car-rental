import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!currentUser) return;
    try {
      const data = await api('/notifications/mine');
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function markOne(n) {
    if (n.read_at) return;
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    try { await api(`/notifications/${n.id}/read`, { method: 'POST' }); } catch { /* best-effort */ }
  }

  async function markAll() {
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Notifications</h1>
        {unread > 0 && (
          <button className="btn sec sm" onClick={markAll} disabled={busy}>
            {busy ? 'Marking…' : `Mark all read (${unread})`}
          </button>
        )}
      </div>
      {err && <div className="alert err">{err}</div>}
      {items.length === 0 && (
        <div className="empty-state">
          <p>You are all caught up. Booking and KYC updates appear here.</p>
        </div>
      )}
      {items.map((n) => (
        <div
          className={`booking-card${n.read_at ? ' read' : ''}`}
          key={n.id}
          onClick={() => markOne(n)}
          style={{ cursor: n.read_at ? 'default' : 'pointer', opacity: n.read_at ? 0.65 : 1 }}
        >
          <div className="notification-item">
            <div className={`badge-dot${n.read_at ? '' : ' unread'}`} />
            <div className="notification-content">
              <p className="notification-title" style={{ fontWeight: n.read_at ? 400 : 700 }}>{n.title}</p>
              {n.body && <p className="notification-body">{n.body}</p>}
              <p className="notification-time">{new Date(n.created_at).toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
