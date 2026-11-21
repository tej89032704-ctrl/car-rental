import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import { useToast } from '../ui.jsx';
import KycVerify from '../../../../packages/shared/src/KycVerify.jsx';

/**
 * Verification: the reference's progress ring over a step list, wired to the
 * five things this account can actually be checked on.
 *
 * The reference listed five hard-coded documents (licence, RC, insurance,
 * bank…). This portal's KYC only requires `id_proof` and `address_proof`, so
 * the steps are derived from real state instead of copied: the two document
 * types /kyc/me reports, plus phone, profile completion and vehicle RC, all of
 * which are fields we genuinely hold. The ring counts approved steps only.
 *
 * KycVerify stays mounted underneath as the detail view -- it owns the full
 * document manager and the offline e-KYC flow, which the summary above does
 * not try to reproduce.
 */

/**
 * What each document step actually accepts.
 *
 * "Identity document" on its own means nothing to someone standing there with a
 * PAN card, so the step names the papers the reviewer will accept. Aadhaar is
 * listed first on purpose: the API verifies it against the UIDAI record and
 * approves it without a human, while the rest go to manual review.
 */
const DOC_HINTS = {
  id_proof: 'Aadhaar, PAN card, passport or driving licence — photo or PDF',
  address_proof: 'Aadhaar, electricity bill, rent agreement or bank statement — photo or PDF',
};
/**
 * What the upload button offers, in the order the reviewer prefers it.
 *
 * The file dialog alone cannot say which document it is opening for, and the
 * API files an upload under a `doc_type` -- sending a PAN card as "aadhaar"
 * would claim a UIDAI check that never happened. Naming the paper first also
 * lets Aadhaar take the instant-verification path instead of manual review.
 */
const DOC_CHOICES = {
  id_proof: [
    { key: 'aadhaar', label: 'Aadhaar card', docType: 'aadhaar', note: 'Verified instantly' },
    { key: 'pan', label: 'PAN card', docType: 'id_proof' },
    { key: 'passport', label: 'Passport', docType: 'id_proof' },
    { key: 'licence', label: 'Driving licence', docType: 'driving_license' },
  ],
  address_proof: [
    { key: 'aadhaar', label: 'Aadhaar card', docType: 'address_proof' },
    { key: 'bill', label: 'Electricity bill', docType: 'address_proof' },
    { key: 'rent', label: 'Rent agreement', docType: 'address_proof' },
    { key: 'bank', label: 'Bank statement', docType: 'address_proof' },
  ],
};

const TONE = {
  approved: { bg: 'color-mix(in srgb, var(--ok) 16%, transparent)', fg: 'var(--ok)', glyph: '✓' },
  pending: { bg: 'color-mix(in srgb, var(--acc) 14%, transparent)', fg: 'var(--acc)', glyph: '…' },
  rejected: { bg: 'color-mix(in srgb, var(--bad) 14%, transparent)', fg: 'var(--bad)', glyph: '!' },
  action: { bg: 'var(--line)', fg: 'var(--mut)', glyph: '+' },
};

export default function Kyc() {
  const { kyc, profile, cars, reload, errors } = useData();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [grown, setGrown] = useState(false);
  // The step whose document chooser is open, if any.
  const [picking, setPicking] = useState(null);
  const fileRefs = useRef({});
  // What the user picked in the chooser, read when the file dialog answers.
  // Only one chooser can be open at a time, so one slot is enough.
  const pendingDoc = useRef(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const user = profile?.user;
  const docs = kyc?.documents || [];

  /**
   * Newest document of a type wins -- a re-upload supersedes the first.
   *
   * An Aadhaar card fills the identity slot too (the API treats it as an id
   * proof), so the step must not read "Not uploaded yet" after one is filed.
   */
  const docFor = (type) => {
    const types = type === 'id_proof' ? ['id_proof', 'aadhaar'] : [type];
    return docs
      .filter((d) => types.includes(d.doc_type))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  };

  /**
   * A document step. The accepted papers ride along only while the step still
   * needs something -- an approved step has no hint to give.
   */
  function docStep(type, label) {
    const d = docFor(type);
    const hint = DOC_HINTS[type];
    if (!d) return { key: type, label, tone: 'action', text: 'Not uploaded yet', action: 'Upload', docType: type, hint };
    if (d.status === 'approved') return { key: type, label, tone: 'approved', text: 'Approved' };
    if (d.status === 'rejected') {
      return {
        key: type, label, tone: 'rejected', docType: type, action: 'Re-upload', hint,
        text: d.rejection_reason ? `Rejected — ${d.rejection_reason}` : 'Rejected — upload it again',
      };
    }
    return { key: type, label, tone: 'pending', text: 'In review', hint };
  }

  const rcVerified = cars.some((c) => c.verification_status === 'verified');
  const rcStarted = cars.some((c) => c.verification_status && c.verification_status !== 'unverified');

  const steps = [
    docStep('id_proof', 'Identity document'),
    docStep('address_proof', 'Address proof'),
    user?.phone
      ? { key: 'phone', label: 'Phone number', tone: 'approved', text: user.phone }
      : { key: 'phone', label: 'Phone number', tone: 'action', text: 'Not added', action: 'Complete', go: '/profile' },
    user?.profile_completed
      ? { key: 'profile', label: 'Profile details', tone: 'approved', text: 'All fields filled' }
      : { key: 'profile', label: 'Profile details', tone: 'action', text: 'Some details missing', action: 'Complete', go: '/profile' },
    rcVerified
      ? { key: 'rc', label: 'Vehicle RC', tone: 'approved', text: 'At least one car verified' }
      : rcStarted
        ? { key: 'rc', label: 'Vehicle RC', tone: 'pending', text: 'Submitted for review' }
        : { key: 'rc', label: 'Vehicle RC', tone: 'action', text: 'No RC uploaded yet', action: 'View fleet', go: '/' },
  ];

  const done = steps.filter((s) => s.tone === 'approved').length;
  const total = steps.length;
  const dash = 327;
  const offset = dash - dash * (grown ? done / total : 0);

  async function upload(step, file) {
    if (!file || !step.docType) return;
    const picked = pendingDoc.current?.stepKey === step.key
      ? pendingDoc.current
      : { docType: step.docType, label: step.label };
    setBusy(step.key);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('doc_type', picked.docType);
      fd.append('file', file);
      const r = await api('/kyc/documents', { method: 'POST', form: fd });
      await reload();
      setGrown(true);
      toast(r?.verify_detail || `${picked.label} uploaded. Awaiting review.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
      pendingDoc.current = null;
      if (fileRefs.current[step.key]) fileRefs.current[step.key].value = '';
    }
  }

  /**
   * Remember which paper was chosen, then open the file dialog from inside the
   * same click so the browser still treats it as a user gesture.
   */
  function chooseDocument(step, choice) {
    pendingDoc.current = { ...choice, stepKey: step.key };
    fileRefs.current[step.key]?.click();
    setPicking(null);
  }

  return (
    <>
      <div className="hd">
        <div>
          <div className="ey">Trust</div>
          <h2>Get <em>verified</em></h2>
          <p>Approved steps are what make a listing bookable.</p>
        </div>
        <span className={`tag ${user?.kyc_status === 'approved' ? 'a' : user?.kyc_status === 'rejected' ? 'd' : ''}`}>
          KYC {user?.kyc_status || 'pending'}
        </span>
      </div>

      {errors.kyc && <div className="alert err">{errors.kyc}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="vr">
        <div className="c rg">
          <div style={{ position: 'relative', width: 170, height: 170, margin: '0 auto' }}>
            <svg viewBox="0 0 120 120" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
              <circle className="t" cx="60" cy="60" r="52" />
              <circle className="p" cx="60" cy="60" r="52"
                strokeDasharray={dash} strokeDashoffset={offset} />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center',
            }}>
              <div>
                <div style={{ font: '300 44px Fraunces', lineHeight: 1 }}>{done}/{total}</div>
                <div className="mt" style={{ fontSize: 12 }}>steps done</div>
              </div>
            </div>
          </div>
          <p className="mt" style={{ marginTop: 18 }}>
            {(kyc?.required_docs || []).length} document{(kyc?.required_docs || []).length === 1 ? '' : 's'} required
            {kyc?.complete ? ' · all received' : ' · still outstanding'}
          </p>
        </div>

        <div>
          {steps.map((step) => {
            const tone = TONE[step.tone];
            return (
              <div className="vs c" key={step.key}>
                <span className="ic" style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">
                  {tone.glyph}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{step.label}</b>
                  <div className="mt" style={{ fontSize: 13 }}>{step.text}</div>
                  {step.hint && <div className="mt" style={{ fontSize: 12, marginTop: 2 }}>{step.hint}</div>}
                </div>

                {step.docType && (
                  <>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      hidden
                      ref={(el) => { fileRefs.current[step.key] = el; }}
                      onChange={(e) => upload(step, e.target.files?.[0])}
                    />
                    {step.action && (
                      <button className="o" disabled={busy === step.key}
                        onClick={() => setPicking(step)}>
                        {busy === step.key ? 'Uploading…' : step.action}
                      </button>
                    )}
                  </>
                )}
                {!step.docType && step.action && (
                  <button className="o" onClick={() => navigate(step.go)}>{step.action}</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {picking && (
        <div className="mdl on" onClick={() => setPicking(null)}>
          <div
            className="sheet modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose the document to upload"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dp">
              <div className="ey">Upload</div>
              <h3 className="sf" style={{ fontSize: 24, marginBottom: 6 }}>
                Which document is this?
              </h3>
              <p className="mt" style={{ fontSize: 13, marginBottom: 16 }}>
                Pick the paper first, then choose the file from your device.
              </p>
              <div className="spd">
                {(DOC_CHOICES[picking.key] || []).map((choice) => (
                  <button
                    key={choice.key}
                    className="o"
                    onClick={() => chooseDocument(picking, choice)}
                  >
                    {choice.label}
                    {choice.note && (
                      <small className="mt" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                        {choice.note}
                      </small>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="o" onClick={() => setPicking(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="page-section-title">Document verification</div>
      <p className="mt" style={{ marginTop: -6, marginBottom: 16 }}>
        The full document manager — licence, RC, insurance and offline e-KYC.
      </p>
      <KycVerify />
    </>
  );
}
