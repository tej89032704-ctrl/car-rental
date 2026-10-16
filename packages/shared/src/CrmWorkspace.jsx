import { useEffect, useState } from 'react';
import { api, sessionUser } from './api.js';
import '../styles/crm.css';

const stages = ['new', 'contacted', 'quoted', 'accepted', 'closed', 'lost'];
const money = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((v || 0) / 100);
const blank = { subject: '', city: '', start_date: '', end_date: '', budget: '', customer_user_id: '' };

export default function CrmWorkspace() {
  const role = sessionUser()?.role;
  const customer = role === 'car_renter';
  const admin = role === 'super_admin';
  const [result, setResult] = useState(null);
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [edit, setEdit] = useState({});
  const [activities, setActivities] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '12', search });
      if (status) q.set('status', status);
      setResult(await api(`/crm/enquiries?${q}`));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { let active = true; setLoading(true);
    const q = new URLSearchParams({ page: String(page), pageSize: '12', search });
    if (status) q.set('status', status);
    api(`/crm/enquiries?${q}`).then((r) => { if (active) setResult(r); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, status]);
  useEffect(() => {
    if (admin || role === 'manager') api('/crm/staff').then(setStaff).catch((e) => setError(e.message));
  }, [role]);

  async function act(fn) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { const r = await fn(); setMessage(r.message || 'Saved'); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function open(row) {
    setSelected(row); setActivities([]); setNote(''); setError('');
    setEdit({ status: row.status, manager_user_id: row.manager_user_id || '', agent_user_id: row.agent_user_id || '', quote: row.quote_paise ? String(row.quote_paise / 100) : '', quote_note: row.quote_note || '', follow_up: row.follow_up_at ? new Date(new Date(row.follow_up_at).getTime() - new Date(row.follow_up_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '' });
    try { setActivities(await api(`/crm/enquiries/${row.id}/activities`)); }
    catch (e) { setError(e.message); }
  }
  async function create(e) {
    e.preventDefault();
    await act(async () => {
      const { budget, customer_user_id, ...body } = form;
      const r = await api('/crm/enquiries', { method: 'POST', body: { ...body, budget_paise: Math.round(Number(budget) * 100), ...(!customer ? { customer_user_id } : {}) } });
      setForm(blank); setShowForm(false); return r;
    });
  }
  async function save(e) {
    e.preventDefault();
    await act(async () => {
      const body = { status: edit.status, quote_note: edit.quote_note, follow_up_at: edit.follow_up ? new Date(edit.follow_up).toISOString() : null };
      if (edit.quote) body.quote_paise = Math.round(Number(edit.quote) * 100);
      if (admin || role === 'manager') { body.agent_user_id = edit.agent_user_id || null; body.manager_user_id = admin ? edit.manager_user_id || null : sessionUser().id; }
      const r = await api(`/crm/enquiries/${selected.id}`, { method: 'PATCH', body });
      setSelected(null); return r;
    });
  }
  const rows = result?.data || [];
  const terminal = selected && ['accepted','closed','lost'].includes(selected.status);
  const agents = staff.filter((u) => u.role === 'agent' && u.status === 'active' && u.manager_user_id === (admin ? edit.manager_user_id : sessionUser()?.id));
  return <div className="crm">
    <header className="crm-hero">
      <div><span className="crm-eyebrow">{customer ? 'YOUR NEXT JOURNEY' : 'RENTAL OPERATIONS / CRM'}</span><h1>{customer ? 'Enquiries & quotes' : 'Turn conversations into journeys.'}</h1><p>{customer ? 'Tell us what you need. Track your enquiry and review a tailored quote.' : 'One clear workspace for customers, follow-ups and your team’s next move.'}</p></div>
      <button className="btn" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close form' : '+ New enquiry'}</button>
    </header>
    {error && <div className="alert err" role="alert">{error}</div>}{message && <div className="alert good" role="status">{message}</div>}
    <div className="crm-summary"><div><strong>{result?.pagination.totalItems ?? '—'}</strong><span>{status ? `${status} enquiries` : 'Enquiries in your view'}</span></div><div><strong>{rows.filter((r) => r.status === 'quoted').length}</strong><span>Quotes on this page</span></div><div><strong>{rows.filter((r) => r.follow_up_at && new Date(r.follow_up_at) < new Date() && !['accepted','closed','lost'].includes(r.status)).length}</strong><span>Follow-ups due on this page</span></div></div>
    {showForm && <form className="card crm-form" onSubmit={create}><h2>{customer ? 'Plan your rental' : 'Create customer enquiry'}</h2><p className="muted">An enquiry is not a confirmed booking. The owner still approves rental requests.</p><div className="crm-fields">
      {!customer && <label>Customer account ID<input className="f" required value={form.customer_user_id} onChange={(e) => setForm({ ...form, customer_user_id: e.target.value })} placeholder="Existing renter account UUID" /></label>}
      <label>What are you looking for?<input className="f" required minLength={3} maxLength={160} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="A comfortable SUV for a weekend away" /></label>
      <label>City<input className="f" required minLength={2} maxLength={80} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
      <label>Pickup date<input className="f" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
      <label>Return date<input className="f" type="date" required min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
      <label>Total budget (₹)<input className="f" type="number" min="0" max="21474836" step="0.01" required value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></label>
    </div><button className="btn" disabled={busy}>Submit enquiry</button></form>}
    <div className="crm-toolbar"><label className="crm-search">Search enquiries<input className="f" placeholder="Search subject or city" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label><label>Stage<select className="f" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All stages</option>{stages.map((s) => <option key={s}>{s}</option>)}</select></label></div>
    {loading ? <p role="status">Loading enquiries…</p> : !rows.length ? <div className="crm-empty"><h2>A clear road ahead.</h2><p>{customer ? 'Create your first enquiry and let our team help you find the right car.' : 'No enquiries match this view. New customer enquiries appear in the admin queue until assigned.'}</p></div> : <div className="crm-grid">{rows.map((r) => <article className="crm-card" key={r.id}><div className="crm-card-top"><span className={`crm-stage stage-${r.status}`}>{r.status}</span><span className="muted">{r.city}</span></div><h2>{r.subject}</h2><p className="muted">{r.customer_name} · {r.start_date} → {r.end_date}</p><div className="crm-card-money"><div><span>Budget</span><strong>{money(r.budget_paise)}</strong></div><div><span>Quote</span><strong>{r.quote_paise ? money(r.quote_paise) : 'Not yet'}</strong></div></div><p className="muted">{r.agent_name ? `Agent: ${r.agent_name}` : r.manager_name ? `Manager: ${r.manager_name}` : 'Awaiting team assignment'}</p>{r.follow_up_at && !customer && <p className="muted">Follow-up: {new Date(r.follow_up_at).toLocaleString()}</p>}<button className="btn sec" onClick={() => open(r)}>{customer ? 'View enquiry' : 'Manage enquiry'} →</button></article>)}</div>}
    {result && <div className="crm-pagination"><span>Page {page} of {Math.max(1, result.pagination.totalPages)} · {result.pagination.totalItems} results</span><div><button className="btn sec sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button> <button className="btn sec sm" disabled={page >= result.pagination.totalPages || loading} onClick={() => setPage(page + 1)}>Next</button></div></div>}
    {selected && <section className="card crm-detail" aria-label="Enquiry details"><div className="crm-detail-heading"><h2>{selected.subject}</h2><button className="btn sec sm" onClick={() => setSelected(null)}>Close details</button></div><p className="muted">Enquiry ID: {selected.id}</p>{customer ? <><p>Quote: <b>{selected.quote_paise ? money(selected.quote_paise) : 'Awaiting quote'}</b></p><p>{selected.quote_note}</p>{selected.status === 'quoted' && <button className="btn" disabled={busy} onClick={() => act(async () => { const r = await api(`/crm/enquiries/${selected.id}/accept`, { method: 'POST' }); setSelected(null); return r; })}>Accept quote</button>}<p className="muted">Quote acceptance does not reserve a car or charge you. Request a booking separately.</p></> : <form onSubmit={save}><div className="crm-fields">
      {admin && <label>Manager<select className="f" value={edit.manager_user_id} onChange={(e) => setEdit({ ...edit, manager_user_id: e.target.value, agent_user_id: '' })}><option value="">Unassigned</option>{staff.filter((u) => u.role === 'manager' && u.status === 'active').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
      {(admin || role === 'manager') && <label>Assigned agent<select className="f" value={edit.agent_user_id} onChange={(e) => setEdit({ ...edit, agent_user_id: e.target.value })}><option value="">No agent</option>{agents.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
      <label>Stage<select className="f" disabled={terminal} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{stages.filter((s) => s !== 'accepted' || selected.status === 'accepted').map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Follow-up time<input className="f" type="datetime-local" value={edit.follow_up} onChange={(e) => setEdit({ ...edit, follow_up: e.target.value })} /></label>
      <label>Quote total (₹)<input className="f" type="number" min="0.01" step="0.01" max="21474836" value={edit.quote} onChange={(e) => setEdit({ ...edit, quote: e.target.value })} /></label>
      <label>Customer-facing quote note<textarea className="f" maxLength={2000} value={edit.quote_note} onChange={(e) => setEdit({ ...edit, quote_note: e.target.value })} /></label>
    </div><button className="btn" disabled={busy || terminal}>Save enquiry</button>{terminal && <p className="muted">This enquiry is final and cannot be edited.</p>}</form>}
    {!customer && <form className="crm-note" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await api(`/crm/enquiries/${selected.id}/notes`, { method: 'POST', body: { body: note } }); setNote(''); setActivities(await api(`/crm/enquiries/${selected.id}/activities`)); return r; }); }}><label>Internal team note<textarea className="f" required maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label><button className="btn sec" disabled={busy}>Add internal note</button></form>}
    <h3>Activity history</h3><div className="crm-timeline">{activities.map((a) => <div key={a.id}><span className="muted">{new Date(a.created_at).toLocaleString()} · {a.visibility}</span><p>{a.body}</p></div>)}</div></section>}
  </div>;
}
