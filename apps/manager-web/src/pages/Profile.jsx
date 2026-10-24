import { useEffect, useState } from 'react';
import { api, sessionUser, clearSession } from '../../../../packages/shared/src/api.js';

export default function ManagerProfile() {
  const [user, setUser] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const me = sessionUser();
    if (me) setUser(me);
    api('/auth/me')
      .then((r) => { if (r.user) setUser(r.user); })
      .catch((e) => setErr(e.message));
  }, []);

  if (!user) {
    return (
      <div className="page-header"><h1>My profile</h1></div>
    );
  }

  const rows = [
    ['Name', user.name],
    ['Email', user.email],
    ['Phone', user.phone],
    ['Role', 'Operations manager'],
  ];

  return (
    <>
      <div className="page-header"><h1>My profile</h1></div>
      {err && <div className="alert err">{err}</div>}

      <div className="booking-card">
        <div className="section-header"><h2>Account</h2></div>
        <table className="t">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td style={{ width: 160, color: 'var(--muted, #7a7165)' }}>{k}</td>
                <td>{v || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <br />
        <button className="btn sec" onClick={() => { clearSession(); window.location.href = '/manager/login'; }}>
          Sign out
        </button>
      </div>
    </>
  );
}
