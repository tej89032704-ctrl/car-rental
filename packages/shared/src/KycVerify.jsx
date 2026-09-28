import { useEffect, useState } from 'react';
import { api, currentUser } from './api.js';
import { TYPE_LABEL, CHECK_LABEL, CHECK_TEXT, checkPill, VerifyPill } from './KycStatus.jsx';

/**
 * The KYC submission page, shared by the renter and owner portals.
 *
 * They differ only in which row classes they use, so that is the whole
 * `variant` contract — everything else is identical and lives here once.
 */
const VARIANTS = {
  renter: { status: ['info-row', 'info-label'], doc: ['kyc-doc-row', 'kyc-doc-label'] },
  owner: { status: ['info-row', 'info-label'], doc: ['info-row', 'info-label'] },
};

const cardTitle = { fontSize: '1.05rem', fontWeight: 600, margin: '0 0 6px' };

export default function KycVerify({ variant = 'renter' }) {
  const CL = VARIANTS[variant] || VARIANTS.renter;

  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // Which way the applicant is proving identity: an offline e-KYC pack, or a
  // photo of the card typed in by hand.
  const [aadhaarMode, setAadhaarMode] = useState('ekyc');
  const [zip, setZip] = useState(null);
  const [shareCode, setShareCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [cardFile, setCardFile] = useState(null);
  const [cardNo, setCardNo] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState(null);

  const [dlNo, setDlNo] = useState('');
  const [dlExpiry, setDlExpiry] = useState('');
  const [dlFile, setDlFile] = useState(null);
  const [dlBusy, setDlBusy] = useState(false);

  async function load() {
    try { setData(await api('/kyc/me')); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (currentUser) load(); }, []);

  function note(m) { setMsg(m); setErr(''); }
  function oops(e) { setErr(e.message); setMsg(''); }

  async function upload(docType, file, extra) {
    setErr(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('doc_type', docType);
      fd.append('file', file);
      Object.entries(extra || {}).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') fd.append(k, v); });
      const r = await api('/kyc/documents', { method: 'POST', form: fd });
      note(r?.verify_detail || `${TYPE_LABEL[docType] || docType} uploaded. Awaiting review.`);
      await load();
    } catch (e) { oops(e); }
  }

  async function submitEkyc(e) {
    e.preventDefault();
    if (!zip) { oops(new Error('Choose the offline e-KYC .zip file first.')); return; }
    setVerifying(true); setVerdict(null); setErr(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', zip);
      fd.append('share_code', shareCode);
      if (mobile) fd.append('mobile', mobile);
      const r = await api('/kyc/offline-ekyc', { method: 'POST', form: fd });
      setVerdict(r);
      if (r.document) note('Aadhaar verified and filed. Awaiting review.');
      await load();
    } catch (e) { oops(e); }
    finally { setVerifying(false); }
  }

  async function submitCard(e) {
    e.preventDefault();
    if (!cardFile) { oops(new Error('Choose a photo of your Aadhaar card first.')); return; }
    await upload('aadhaar', cardFile, { doc_number: cardNo });
    setCardFile(null); setCardNo('');
  }

  async function submitDl(e) {
    e.preventDefault();
    if (!dlFile) { oops(new Error('Choose a photo of your driving licence first.')); return; }
    setDlBusy(true);
    await upload('driving_license', dlFile, { doc_number: dlNo, doc_expiry: dlExpiry });
    setDlBusy(false);
    setDlFile(null); setDlNo(''); setDlExpiry('');
  }

  if (!currentUser) return <div className="alert info">Login first.</div>;
  if (!data) return err ? <div className="alert err">{err}</div> : <p className="muted">Loading…</p>;

  const payload = verdict?.document?.verified_payload
    ? JSON.parse(verdict.document.verified_payload)
    : null;
  const cross = verdict?.crossCheck;

  return (
    <>
      <div className="page-header">
        <h1>Account verification</h1>
      </div>
      {msg && <div className="alert good">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      {/* ---------- status + required documents ---------- */}
      <div className="card">
        <div className={CL.status[0]}>
          <span className={CL.status[1]}>Status</span>
          <span className={`pill ${currentUser.kyc_status}`}>{currentUser.kyc_status}</span>
          <span className={CL.status[1]} style={{ marginLeft: 12 }}>Phone</span>
          <span className={`pill ${currentUser.status === 'active' ? 'active' : 'pending_otp'}`}>{currentUser.status}</span>
        </div>
        {data.complete
          ? <div className="alert good">Your verification is complete. Enjoy the platform!</div>
          : <div className="alert info">Upload the documents below. Verification unlocks all account actions.</div>}
        {data.required_docs.map((t) => {
          // An Aadhaar document fills the ID-proof slot, so show whichever of
          // the two the applicant actually filed.
          const doc = data.documents.find((d) => d.doc_type === t)
            || (t === 'id_proof' ? data.documents.find((d) => d.doc_type === 'aadhaar') : null);
          return (
            <div key={t} className={CL.doc[0]}>
              <span className={CL.doc[1]}>{TYPE_LABEL[t] || t}</span>
              <input type="file" onChange={(e) => e.target.files[0] && upload(t, e.target.files[0])} />
              {doc && <span className={`pill ${doc.status}`}>{doc.status}</span>}
              {doc && doc.doc_type !== t && <span className="pill requested">via Aadhaar</span>}
              {doc && doc.doc_number && <span className="muted">{doc.doc_number}</span>}
            </div>
          );
        })}
      </div>

      {/* ---------- Aadhaar ---------- */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={cardTitle}>Aadhaar</h2>
        <p className="muted">
          The offline e-KYC file is checked against UIDAI's digital signature — the strongest
          option. The card photo is checked for a valid number. Your full Aadhaar number is
          never stored; only <b>XXXX XXXX 1234</b> is kept.
        </p>

        <div className="form-group" style={{ maxWidth: 380 }}>
          <label className="f" htmlFor="aadhaar-mode">Verification method</label>
          <select
            id="aadhaar-mode"
            className="f"
            value={aadhaarMode}
            onChange={(e) => { setAadhaarMode(e.target.value); setVerdict(null); }}
          >
            <option value="ekyc">Offline e-KYC file (from myAadhaar)</option>
            <option value="card">Photo of the card + number</option>
          </select>
        </div>

        {aadhaarMode === 'ekyc' ? (
          <form onSubmit={submitEkyc}>
            <div className="row">
              <div className="form-group">
                <label className="f">Offline e-KYC file</label>
                <input
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={(e) => setZip(e.target.files[0] || null)}
                />
              </div>
              <div className="form-group">
                <label className="f">Share code</label>
                <input
                  className="f"
                  inputMode="numeric"
                  maxLength={16}
                  placeholder="The code you set when downloading"
                  value={shareCode}
                  onChange={(e) => setShareCode(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="row">
              <div className="form-group">
                <label className="f">Mobile linked to Aadhaar (optional)</label>
                <input
                  className="f"
                  inputMode="tel"
                  maxLength={16}
                  placeholder="Checked only if you supply it"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
              </div>
            </div>
            <button className="btn" disabled={verifying}>
              {verifying ? 'Verifying…' : 'Verify offline e-KYC'}
            </button>
            <p className="muted" style={{ marginTop: 10 }}>
              On myAadhaar, choose <b>Download Aadhaar Offline XML</b>, set a Share Code, and
              upload the ZIP it gives you.
            </p>
          </form>
        ) : (
          <form onSubmit={submitCard}>
            <div className="row">
              <div className="form-group">
                <label className="f">Aadhaar number</label>
                <input
                  className="f"
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="1234 5678 9012 or 123456789012"
                  value={cardNo}
                  onChange={(e) => setCardNo(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="f">Photo of the card</label>
                <input type="file" accept="image/*" onChange={(e) => setCardFile(e.target.files[0] || null)} />
              </div>
            </div>
            <button className="btn" disabled={verifying}>
              {verifying ? 'Uploading…' : 'Submit Aadhaar card'}
            </button>
          </form>
        )}

        {verdict && <VerdictPanel verdict={verdict} payload={payload} cross={cross} />}
      </div>

      {/* ---------- driving licence ---------- */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={cardTitle}>Driving licence <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></h2>
        <p className="muted">
          Optional, but it proves you can drive. The number is checked against its state code
          and the expiry date must be in the future.
        </p>
        <form onSubmit={submitDl}>
          <div className="row">
            <div className="form-group">
              <label className="f">Licence number</label>
              <input
                className="f"
                maxLength={24}
                placeholder="KA01 20190012345"
                value={dlNo}
                onChange={(e) => setDlNo(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="f">Valid up to</label>
              <input
                className="f"
                type="date"
                value={dlExpiry}
                onChange={(e) => setDlExpiry(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="f">Photo of the licence</label>
              <input type="file" accept="image/*" onChange={(e) => setDlFile(e.target.files[0] || null)} />
            </div>
          </div>
          <button className="btn" disabled={dlBusy}>{dlBusy ? 'Uploading…' : 'Submit driving licence'}</button>
        </form>
      </div>

      {/* ---------- everything filed so far ---------- */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={cardTitle}>Submitted</h2>
        {data.documents.length === 0
          ? <p className="muted">Nothing filed yet.</p>
          : (
            <table className="t">
              <thead>
                <tr><th>Document</th><th>Number</th><th>Valid up to</th><th>Checks</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {TYPE_LABEL[d.doc_type] || d.doc_type}
                      {d.file_url ? (
                        <img
                          src={d.file_url}
                          alt={TYPE_LABEL[d.doc_type] || d.doc_type}
                          style={{ display: 'block', width: 64, height: 64, objectFit: 'cover', borderRadius: 8, marginTop: 6, border: '1px solid var(--line)' }}
                        />
                      ) : null}
                    </td>
                    <td>{d.doc_number || '—'}</td>
                    <td>{d.doc_expiry || '—'}</td>
                    <td>
                      <VerifyPill status={d.verify_status} detail={d.verify_detail} />
                      {d.verify_detail && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{d.verify_detail}</div>}
                    </td>
                    <td><span className={`pill ${d.status}`}>{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </>
  );
}

function VerdictPanel({ verdict, payload, cross }) {
  const bad = verdict.status === 'fail';
  const cls = bad ? 'err' : verdict.status === 'review' ? 'info' : 'good';

  return (
    <div className={`alert ${cls}`} style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>{bad ? 'Not accepted' : verdict.status === 'review' ? 'Accepted, needs a look' : 'Verified'}</b>
        <span className={`pill ${bad ? 'rejected' : verdict.status === 'review' ? 'requested' : 'approved'}`}>
          {verdict.code}
        </span>
      </div>
      <p style={{ margin: '8px 0 0' }}>{verdict.message}</p>
      {verdict.detail && <p className="muted" style={{ margin: '4px 0 0' }}>{verdict.detail}</p>}

      {verdict.warnings?.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {verdict.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      {payload && (
        <div style={{ marginTop: 10 }}>
          <div><b>Name</b> — {payload.name || '—'}</div>
          <div><b>Date of birth</b> — {payload.dob || payload.year || '—'}</div>
          <div><b>Gender</b> — {payload.gender || '—'}</div>
          {payload.address && Object.keys(payload.address).length > 0 && (
            <div style={{ marginTop: 6 }}>
              <b>Address</b>
              <div className="muted">
                {['house', 'street', 'loc', 'vtc', 'po', 'dist', 'state', 'pc', 'country']
                  .map((k) => payload.address[k]).filter(Boolean).join(', ')}
              </div>
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Reference {payload.referenceId} · issued {payload.issuedAt ? new Date(payload.issuedAt).toLocaleString() : '—'}
            {payload.certLabel ? ` · signed by ${payload.certLabel}` : ''}
            {payload.ageDays != null ? ` · ${payload.ageDays} days old` : ''}
          </div>
        </div>
      )}

      {cross && (
        <div style={{ marginTop: 10 }}>
          {Object.keys(CHECK_LABEL).map((k) => (
            <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span className={`pill ${checkPill(cross[k])}`}>{CHECK_LABEL[k]}</span>
              <span>{CHECK_TEXT[cross[k]] || cross[k]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
