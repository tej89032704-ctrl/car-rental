/** Shared vocabulary for showing KYC documents across all four portals. */

export const TYPE_LABEL = {
  id_proof: 'ID proof',
  address_proof: 'Address proof',
  aadhaar: 'Aadhaar',
  driving_license: 'Driving licence',
};

/** Server cross-check verdicts, in the order a reviewer reads them. */
export const CHECK_LABEL = { last4: 'Last 4 digits', dob: 'Date of birth', name: 'Name', mobile: 'Mobile' };

export const CHECK_TEXT = {
  match: 'matches your account',
  mismatch: 'does not match your account',
  absent: 'not supplied',
  unparsable: 'could not be read',
  unverified: 'not supplied',
};

export function checkPill(v) {
  if (v === 'match') return 'approved';
  if (v === 'mismatch') return 'rejected';
  return 'pending';
}

/**
 * Machine verdict badge. Monochrome, like every other pill in the app —
 * dark = passed, pale = needs a human, outlined = rejected.
 */
export function VerifyPill({ status, detail }) {
  if (!status) return null;
  const cls = status === 'pass' ? 'approved' : status === 'review' ? 'requested' : 'rejected';
  const text = status === 'pass' ? 'checks passed' : status === 'review' ? 'needs review' : 'failed checks';
  return <span className={`pill ${cls}`} title={detail || undefined}>{text}</span>;
}
