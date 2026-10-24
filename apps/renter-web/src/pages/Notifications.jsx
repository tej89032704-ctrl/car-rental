import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { relative, toast } from '../components/ui.js';

export default function Notifications() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api('/notifications/mine');
      setRows(Array.isArray(data) ? data : []);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function markAll() {
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setRows((list) => list.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      window.dispatchEvent(new Event('ce:notifications'));
      toast('All caught up');
    } catch (e) {
      setErr(e.message || 'Could not mark these read');
    } finally {
      setBusy(false);
    }
  }

  async function open(n) {
    if (n.read_at) return;
    setRows((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    window.dispatchEvent(new Event('ce:notifications'));
    try {
      await api(`/notifications/${n.id}/read`, { method: 'POST' });
    } catch {
      /* The dot is already gone; a failed read receipt is not worth a banner. */
    }
  }

  const unread = rows.filter((n) => !n.read_at).length;

  return (
    <section className="pg">
      <div className="hd">
        <div>
          <h1>Notifications</h1>
          <p>Quotes, bookings and account updates.</p>
        </div>
        <button className="gh" type="button" onClick={markAll} disabled={!unread || busy}>
          {busy ? 'Marking…' : 'Mark all as read'}
        </button>
      </div>

      {err && <div className="ce-err">{err}</div>}
      {loading && !err && <div className="ce-load"><span className="spinner" /><span>Loading notifications…</span></div>}

      {!loading && !err && !rows.length && (
        <div className="ce-empty">
          <h3>You are all caught up</h3>
          <p>Booking updates and quote replies will appear here.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="panel nt">
          {rows.map((n) => (
            <button
              key={n.id}
              type="button"
              className={n.read_at ? 'r' : ''}
              onClick={() => open(n)}
            >
              <span className="d" aria-hidden="true" />
              <b>
                {n.title}
                {n.body ? <span className="bar">{n.body}</span> : null}
              </b>
              <small>{relative(n.created_at)}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
