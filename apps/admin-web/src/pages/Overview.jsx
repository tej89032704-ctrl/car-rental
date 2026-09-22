import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, currentUser } from '../api.js';

export default function Overview() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (currentUser) api('/admin/overview').then(setData).catch((e) => setErr(e.message));
  }, []);
  if (!currentUser) return <div className="alert info">Login at /login (direct URL only).</div>;
  if (!data) return err ? <div className="alert err">{err}</div> : <p className="muted">Loading…</p>;

  return (
    <>
      <h1>Platform overview</h1>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-value">{data.total_users}</div><div className="stat-label">Total users</div></div>
        <div className="stat-card"><div className="stat-value">{data.active_cars}</div><div className="stat-label">Active cars</div></div>
        <div className="stat-card"><div className="stat-value">{data.pending_review_cars}</div><div className="stat-label">Cars awaiting review</div></div>
        <div className="stat-card"><div className="stat-value">{data.bookings.bookings_today}</div><div className="stat-label">Bookings today</div></div>
        <div className="stat-card"><div className="stat-value">{data.bookings.bookings_week}</div><div className="stat-label">This week</div></div>
        <div className="stat-card"><div className="stat-value">{data.bookings.bookings_month}</div><div className="stat-label">This month</div></div>
        <div className="stat-card"><div className="stat-value">₹{(data.revenue.subscription_revenue_paise / 100).toFixed(0)}</div><div className="stat-label">Subscription revenue</div></div>
      </div>
      <h2>Users by role</h2>
      <div className="card">
        <table className="t"><thead><tr><th>Role</th><th>Count</th></tr></thead><tbody>
          {data.users_by_role.map((r) => <tr key={r.role}><td>{r.role}</td><td>{r.count}</td></tr>)}
        </tbody></table>
      </div>
      <p className="muted">
        Quick links: <Link to="/cars" className="link-brand">approve cars</Link> ·{' '}
        <Link to="/kyc" className="link-brand">review KYC</Link>
      </p>
    </>
  );
}
