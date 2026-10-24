import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import KycVerify from '../../../../packages/shared/src/KycVerify.jsx';
import { toast } from '../components/ui.js';

/**
 * Verification, in the artwork's timeline language.
 *
 * The artwork lists four steps including a selfie check; this API has three
 * checks a renter can actually complete (identity, licence, phone), so the
 * timeline is those three rather than a copy of an unavailable step.
 * KycVerify stays underneath as the document manager — it owns the Aadhaar
 * e-KYC flow and the uploads.
 */
export default function Kyc() {
  const nav = useNavigate();
  const [docs, setDocs] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);
  const [err, setErr] = useState('');
  const docsRef = useRef(null);

  useEffect(() => {
    Promise.all([api('/kyc/me'), api('/auth/me')])
      .then(([k, me]) => {
        setDocs(Array.isArray(k?.documents) ? k.documents : []);
        setComplete(!!k?.complete);
        setUser(me?.user || me);
        setErr('');
      })
      .catch((e) => setErr(e.message || 'Could not load your verification'))
      .finally(() => setLoading(false));
  }, []);

  const newest = (type) => docs
    .filter((d) => d.doc_type === type)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

  function idStep() {
    const d = newest('id_proof') || newest('aadhaar');
    if (!d) return { key: 'id', label: 'Government ID', text: 'Aadhaar or passport · not uploaded', done: false };
    if (d.status === 'approved') return { key: 'id', label: 'Government ID', text: 'Approved', done: true };
    if (d.status === 'rejected') return { key: 'id', label: 'Government ID', text: d.rejection_reason ? `Rejected — ${d.rejection_reason}` : 'Rejected — upload it again', done: false };
    return { key: 'id', label: 'Government ID', text: 'In review', done: false };
  }

  function licenceStep() {
    const d = newest('driving_license');
    if (!d) return { key: 'dl', label: 'Driving licence', text: 'Upload front and back', done: false };
    if (d.status === 'approved') return { key: 'dl', label: 'Driving licence', text: 'Approved', done: true };
    if (d.status === 'rejected') return { key: 'dl', label: 'Driving licence', text: 'Rejected — upload it again', done: false };
    return { key: 'dl', label: 'Driving licence', text: 'In review', done: false };
  }

  function phoneStep() {
    if (!user?.phone) return { key: 'phone', label: 'Phone number', text: 'Add a number in Profile', done: false, go: '/profile' };
    if (user?.phone_verified) return { key: 'phone', label: 'Phone number', text: 'Verified with OTP', done: true };
    return { key: 'phone', label: 'Phone number', text: 'Verify with OTP', done: false, go: '/verify-otp' };
  }

  const steps = [idStep(), licenceStep(), phoneStep()];
  const done = steps.filter((s) => s.done).length;

  function act(step) {
    if (step.go) { nav(step.go); return; }
    toast('Upload the document below');
    docsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="pg">
      <div className="hd">
        <div>
          <h1>Verification</h1>
          <p>
            {loading
              ? 'Checking your steps…'
              : complete
                /* Identity is approved, so booking already works. Saying
                   "finish them all to book" here contradicted the status
                   card right below it. */
                ? 'Identity verified. The licence and phone checks are optional extras.'
                : `${done} of ${steps.length} steps complete. Finish them all to book instantly.`}
          </p>
        </div>
      </div>

      {err && <div className="ce-err">{err}</div>}
      {loading && !err && <div className="ce-load"><span className="spinner" /><span>Loading verification…</span></div>}

      {!loading && (
        <>
          <div className="panel vs">
            {steps.map((s, i) => (
              <div key={s.key}>
                <i className={s.done ? 'd' : ''}>{s.done ? '✓' : i + 1}</i>
                <div>
                  <h3>{s.label}</h3>
                  <p>{s.text}</p>
                </div>
                {s.done
                  ? <span className="stt">Verified</span>
                  : <button type="button" className="go" onClick={() => act(s)}>Verify now</button>}
              </div>
            ))}
          </div>

          <div ref={docsRef} style={{ paddingTop: 30 }}>
            <h2 style={{ fontSize: 28, marginBottom: 6 }}>Documents</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Aadhaar offline e-KYC, a card photo, or your licence — whichever you have.
            </p>
            <div className="ce-kyc">
              <KycVerify />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
