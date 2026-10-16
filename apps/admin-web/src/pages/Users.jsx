import { useEffect, useState } from 'react';
import { api, currentUser, setSession } from '../api.js';
import { refreshMe } from './useAdmin.js';

export default function Users() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [err, setErr] = useState('');
  const [roleRequests, setRoleRequests] = useState([]);

  async function load() {
    if (!currentUser) return;
    try {
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (role) q.set('role', role);
      setRows(await api(`/admin/users?${q}`));
      setRoleRequests(await api('/admin/role-change-requests?status=pending'));
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [search, role]);

  async function setStatus(id, status) {
    try {
      await api(`/admin/users/${id}/status`, { method: 'POST', body: { status } });
      load(); refreshMe();
    } catch (e) { setErr(e.message); }
  }

  async function decideRole(id, decision) {
    setErr('');
    try {
      await api(`/admin/role-change-requests/${id}/decide`, { method: 'POST', body: { decision } });
      load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <h1>User management</h1>
      {err && <div className="alert err">{err}</div>}
      {roleRequests.length > 0 && (
        <>
          <h2>Role change requests ({roleRequests.length} pending)</h2>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>User</th><th>Change</th><th>Requested</th><th>Actions</th></tr></thead>
              <tbody>
                {roleRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.user_name}<div className="muted">{r.user_email}</div></td>
                    <td>{r.current_role_now} → {r.desired_role}</td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="action-cell">
                      <button className="btn ok sm" onClick={() => decideRole(r.id, 'approve')}>Approve</button>
                      <button className="btn bad sm" onClick={() => decideRole(r.id, 'reject')}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="row">
        <input className="f" placeholder="Search name / email / phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="f" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="car_owner">car_owner</option>
          <option value="car_renter">car_renter</option>
          <option value="agent">agent</option>
          <option value="manager">manager</option>
          <option value="super_admin">super_admin</option>
        </select>
      </div>
      <br />
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>KYC</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td>
                <td><span className={`pill ${u.status}`}>{u.status}</span></td>
                <td><span className={`pill ${u.kyc_status}`}>{u.kyc_status}</span></td>
                <td className="action-cell">
                  {u.status !== 'active' && <button className="btn ok sm" onClick={() => setStatus(u.id, 'active')}>Activate</button>}
                  {u.status === 'active' && <button className="btn warn sm" onClick={() => setStatus(u.id, 'suspended')}>Suspend</button>}
                  {u.status !== 'banned' && <button className="btn bad sm" onClick={() => setStatus(u.id, 'banned')}>Ban</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
