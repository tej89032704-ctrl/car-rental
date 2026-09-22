import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [salary, setSalary] = useState({});
  const [assign, setAssign] = useState({ agent_user_id: '', lead_user_id: '', type: 'kyc_first_pass' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() { if (currentUser) setAgents(await api('/admin/agents').catch(() => [])); }
  useEffect(() => { load(); }, []);

  async function act(fn) {
    setErr(''); setMsg('');
    try { const r = await fn(); setMsg(r.message || 'Done'); load(); } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <h1>Agents</h1>
      <div className="alert info">Agents are salaried staff for field ops & issue handling — they earn no commission.</div>
      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      {agents.length === 0 && <div className="card"><p className="muted">No agents onboarded yet. Agents sign up via signup with role "agent", then appear here.</p></div>}
      {agents.map((a) => (
        <div className="card" key={a.id}>
          <div className="agent-card-header">
            <div className="agent-card-info">
              <b>{a.name}</b> <span className="muted">{a.email} · {a.phone}</span>
              <div className="muted">Salary: ₹{((a.monthly_salary_paise || 0) / 100).toFixed(0)}/month</div>
            </div>
            <div className="agent-card-actions">
              <input className="f agent-salary-input" placeholder="₹/month" value={salary[a.user_id] ?? ''}
                onChange={(e) => setSalary({ ...salary, [a.user_id]: e.target.value })} />
              <button className="btn sm" onClick={() => act(() => api('/admin/agents/salary', {
                method: 'POST', body: { agent_user_id: a.user_id, monthly_salary_paise: Math.round(+(salary[a.user_id] || 0) * 100) },
              }))}>Set salary</button>
            </div>
          </div>
        </div>
      ))}

      <h2>Assign lead to agent</h2>
      <div className="card">
        <div className="row">
          <div className="form-group"><label className="f">Agent user id</label><input className="f" value={assign.agent_user_id} onChange={(e) => setAssign({ ...assign, agent_user_id: e.target.value })} /></div>
          <div className="form-group"><label className="f">Lead user id</label><input className="f" value={assign.lead_user_id} onChange={(e) => setAssign({ ...assign, lead_user_id: e.target.value })} /></div>
          <div className="form-group">
            <label className="f">Type</label>
            <select className="f" value={assign.type} onChange={(e) => setAssign({ ...assign, type: e.target.value })}>
              <option>kyc_first_pass</option><option>lead_followup</option><option>issue_resolution</option>
            </select>
          </div>
        </div>
        <br />
        <button className="btn sm" onClick={() => act(() => api('/admin/agents/assign', { method: 'POST', body: assign }))}>Create assignment</button>
      </div>

      <h2>Reports</h2>
      <div className="card">
        <p className="muted">Export CSV (add ?from=YYYY-MM-DD&to=YYYY-MM-DD to filter):</p>
        <div className="report-links">
          {['bookings', 'revenue', 'subscriptions'].map((k) => (
            <a key={k} className="btn sec sm"
              href={`/api/admin/reports/${k}`}>{k}.csv</a>
          ))}
        </div>
      </div>
    </>
  );
}
