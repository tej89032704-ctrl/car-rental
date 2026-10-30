import { useEffect, useRef, useState } from 'react';
import { api, sessionUser } from './api.js';

export default function BookingChat({ bookingId, otherLabel = 'other participant' }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const version = useRef(0);
  const currentId = sessionUser()?.id;

  useEffect(() => {
    let active = true;
    async function refresh() {
      const requestVersion = ++version.current;
      try {
        const rows = await api(`/bookings/${bookingId}/messages`);
        if (active && requestVersion === version.current) {
          setMessages(rows);
          setError('');
          // The server marks this thread read on the GET, so tell the chrome to
          // re-read its badge instead of leaving a count behind for 30s.
          window.dispatchEvent(new Event('booking-chat-read'));
        }
      } catch (e) {
        if (active && requestVersion === version.current) setError(e.message || 'Could not load messages');
      } finally {
        if (active) setLoading(false);
      }
    }
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [bookingId]);

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const message = await api(`/bookings/${bookingId}/messages`, { method: 'POST', body: { body } });
      version.current += 1;
      setMessages((previous) => previous.some((item) => item.id === message.id) ? previous : [...previous, message].slice(-200));
      setDraft('');
    } catch (e) {
      setError(e.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="Booking messages" style={{ marginTop: 18 }}>
      <h3>Messages</h3>
      <p style={{ margin: '4px 0 12px', opacity: 0.75 }}>Chat with your {otherLabel}. Messages refresh every 10 seconds.</p>
      <div role="log" aria-label="Conversation" style={{ maxHeight: 260, overflowY: 'auto', padding: 12, border: '1px solid #aab4b2', borderRadius: 10 }}>
        {loading ? <p>Loading messages…</p> : messages.length === 0 ? <p>No messages yet.</p> : messages.map((message) => (
          <div key={message.id} style={{ marginBottom: 12, overflowWrap: 'anywhere' }}>
            <strong>{message.sender_id === currentId ? 'You' : otherLabel}</strong>{' '}
            <small>{new Date(message.created_at).toLocaleString()}</small>
            <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
          </div>
        ))}
      </div>
      {error && <p role="alert" style={{ color: '#bd3b32', marginTop: 8 }}>{error}</p>}
      <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder="Write a message…" style={{ flex: 1, minWidth: 0, padding: 10 }} />
        <button type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</button>
      </form>
    </section>
  );
}
