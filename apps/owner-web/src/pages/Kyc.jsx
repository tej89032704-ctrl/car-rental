import { useEffect, useState } from 'react';
import { api, currentUser } from '../api.js';

export default function Kyc() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    try { setData(await api('/kyc/me')); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (currentUser) load(); }, []);

  async function upload(docType, file) {
    setErr(''); setMsg('');
    try {
      await api('/kyc/documents', { method: 'POST', form: (() => { const fd = new FormData(); fd.append('doc_type', docType); fd.append('file', file); return fd; })() });
      setMsg('Uploaded. Awaiting review.');
      load();
    } catch (e) { setErr(e.message); }
  }

  if (!currentUser) return <div className="alert info">Login first.</div>;
  if (!data) return err ? <div className="alert err">{err}</div> : <p className="muted">Loading…</p>;

  return (
    <div className="wrap">
      <div className="page-header">
        <h1>Account verification</h1>
      </div>
      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}
      <div className="card">
        <div className="info-row">
          <span className="info-label">Status</span>
          <span className={`pill ${currentUser.kyc_status}`}>{currentUser.kyc_status}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Phone</span>
          <span className={`pill ${currentUser.status === 'active' ? 'active' : 'pending_otp'}`}>{currentUser.status}</span>
        </div>
        {data.complete
          ? <div className="alert good">Your verification is complete. Enjoy the platform!</div>
          : <div className="alert info">Upload the documents below. Verification unlocks all account actions.</div>}
        {data.required_docs.map((t) => {
          const doc = data.documents.find((d) => d.doc_type === t);
          return (
            <div key={t} className="info-row">
              <span className="info-label">{t.replace('_', ' ')}</span>
              <input type="file" onChange={(e) => upload(t, e.target.files[0])} />
              {doc && <span className={`pill ${doc.status}`}>{doc.status}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
