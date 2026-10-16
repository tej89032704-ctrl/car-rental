import { useData, useUnread } from '../data.jsx';
import { relTime } from '../lib.js';

export default function Notifications() {
  const { list, unread, mark } = useUnread();
  const { errors } = useData();

  // Read state is client-side only (localStorage via useUnread), so "read" is
  // simply "not currently unread" -- no server round-trip, no un-mark.
  const unreadIds = new Set(unread.map((n) => n.id));
  const isRead = (n) => !unreadIds.has(n.id);

  return (
    <div>
      <div className="hd">
        <div>
          <div className="ey">Inbox</div>
          <h2>Your <em>notifications</em></h2>
          <p>{unread.length} unread · {list.length} total</p>
        </div>
        <button className="o" disabled={unread.length === 0} onClick={() => mark(unread.map((n) => n.id))}>
          Mark all as read
        </button>
      </div>

      {errors.notifications && <div className="alert err">{errors.notifications}</div>}

      {list.length === 0 ? (
        <div className="empty-state-section">
          <div className="empty-icon">🔔</div>
          <p className="muted">Nothing here yet — new activity on your cars will show up here.</p>
        </div>
      ) : (
        <div className="notification-list">
          {list.map((n) => (
            <div
              key={n.id}
              className={`nt notification-item${isRead(n) ? ' rd' : ''}`}
              style={{ marginBottom: 0 }}
              onClick={() => mark([n.id])}
            >
              <span className="u" />
              <div className="notification-content">
                <div className="notification-title">{n.title}</div>
                <div className="notification-body">{n.body}</div>
                <div className="notification-time">{relTime(n.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
