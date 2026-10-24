import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import CarArt from '../components/CarArt.jsx';
import { confetti, inr, paintFor, ripple, toast, tripRange } from '../components/ui.js';

const STATE = {
  quoted: { label: 'Quoted', tone: '' },
  new: { label: 'Awaiting host', tone: 'w' },
  contacted: { label: 'Awaiting host', tone: 'w' },
  accepted: { label: 'Accepted', tone: '' },
  closed: { label: 'Closed', tone: 'n' },
  lost: { label: 'Declined', tone: 'e' },
};

export default function Enquiries() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    subject: '',
    city: 'Bengaluru',
    start_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 259200000).toISOString().slice(0, 10),
    budget: 5000,
  });

  async function load() {
    try {
      const res = await api('/crm/enquiries?page=1&pageSize=100');
      setRows(Array.isArray(res?.data) ? res.data : []);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Could not load your enquiries');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createEnquiry(e) {
    e.preventDefault();
    if (!form.subject.trim()) { setErr('Subject is required'); return; }
    if (!form.city.trim()) { setErr('City is required'); return; }
    setBusy('create');
    setErr('');
    try {
      await api('/crm/enquiries', {
        method: 'POST',
        body: {
          subject: form.subject.trim(),
          city: form.city.trim(),
          start_date: form.start_date,
          end_date: form.end_date,
          budget_paise: Math.round(Number(form.budget || 0) * 100),
        },
      });
      toast('Custom quote enquiry submitted! An agent or host will reply.');
      setShowNew(false);
      setForm({ ...form, subject: '' });
      await load();
    } catch (e2) {
      setErr(e2.message || 'Could not submit enquiry');
    } finally {
      setBusy('');
    }
  }

  async function accept(e, row) {
    setBusy(row.id);
    try {
      await api(`/crm/enquiries/${row.id}/accept`, { method: 'POST' });
      confetti(e.clientX, e.clientY);
      toast('Quote accepted. A booking still needs owner approval.');
      await load();
    } catch (e2) {
      setErr(e2.message || 'Could not accept this quote');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="pg">
      <div className="hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1>Enquiries &amp; quotes</h1>
          <p>Request custom dates and budgets, or accept host quotes.</p>
        </div>
        <button
          type="button"
          className="go"
          style={{ margin: 0, padding: '12px 24px' }}
          onClick={() => setShowNew(!showNew)}
        >
          {showNew ? 'Close form' : '+ Request custom quote'}
        </button>
      </div>

      {err && <div className="ce-err">{err}</div>}

      {showNew && (
        <form className="panel fm" onSubmit={createEnquiry} style={{ marginBottom: 24, padding: 24 }}>
          {/* .fm is a two-column field grid, so the heading needs to span it
              or the paragraph lands in the right-hand cell beside it. */}
          <div className="w" style={{ padding: '0 28px 18px' }}>
            <h3 style={{ fontSize: 22, marginBottom: 10 }}>New quote enquiry</h3>
            <p className="muted" style={{ margin: 0 }}>
              Tell our agents and car hosts what trip you're planning. They will respond with tailored vehicle offers.
            </p>
          </div>
          <div className="f w">
            <label htmlFor="enq-sub">Trip request or vehicle requirement</label>
            <input
              id="enq-sub"
              required
              placeholder="e.g. 7-seater SUV for family trip to Goa"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
          <div className="f">
            <label htmlFor="enq-city">City</label>
            <input
              id="enq-city"
              required
              placeholder="Bengaluru"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div className="f">
            <label htmlFor="enq-budget">Budget (₹ total)</label>
            <input
              id="enq-budget"
              type="number"
              min="500"
              required
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
          </div>
          <div className="f">
            <label htmlFor="enq-start">Start date</label>
            <input
              id="enq-start"
              type="date"
              required
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div className="f">
            <label htmlFor="enq-end">End date</label>
            <input
              id="enq-end"
              type="date"
              required
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
          <div className="ce-form-actions" style={{ gridColumn: '1 / -1', marginTop: 12 }}>
            <button className="go" type="submit" disabled={busy === 'create'} style={{ margin: 0, padding: '12px 28px' }}>
              {busy === 'create' ? 'Submitting…' : 'Submit enquiry'}
            </button>
            <button className="gh" type="button" onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading && <div className="ce-load"><span className="spinner" /><span>Loading your enquiries…</span></div>}

      {!loading && !err && rows.length === 0 && !showNew && (
        <div className="ce-empty">
          <h3>No enquiries yet</h3>
          <p>Request a custom quote above or browse our live car fleet.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 18 }}>
            <button className="go" type="button" onClick={() => setShowNew(true)} style={{ padding: '13px 26px' }}>Request a quote</button>
            <Link className="gh" style={{ padding: '13px 26px' }} to="/">Browse cars</Link>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="panel rows">
          {rows.map((row) => {
            const state = STATE[row.status] || { label: row.status, tone: 'n' };
            const amount = row.quote_paise ? inr(row.quote_paise) : row.budget_paise ? inr(row.budget_paise) : '—';
            return (
              <div key={row.id}>
                <div className="th">
                  <CarArt accent={paintFor({ id: row.id })} />
                </div>
                <div>
                  <h3>{row.subject}</h3>
                  <p>{tripRange(row.start_date, row.end_date)} · {row.city}</p>
                </div>
                <div className="am">{amount}</div>
                <div>
                  {state.label ? <span className={`stt ${state.tone}`}>{state.label}</span> : null}
                  {row.status === 'quoted' && (
                    <button
                      type="button"
                      className="go"
                      style={{ margin: '0 0 0 10px', padding: '9px 20px' }}
                      disabled={busy === row.id}
                      onClick={(e) => { ripple(e); accept(e, row); }}
                    >
                      {busy === row.id ? 'Accepting…' : 'Accept'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
