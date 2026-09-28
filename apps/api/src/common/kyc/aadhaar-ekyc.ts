import * as crypto from 'crypto';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { loadUidaiCerts, type UidaiCert } from './certs';
import { looksLikeZip, unzipOfflinePack, ZipError } from './zip';

/**
 * Aadhaar Paperless Offline e-KYC — the share-phrase ZIP from myAadhaar.
 *
 * Pipeline: ZIP (password = share phrase) → `OfflinePaperlessKyc` XML →
 * enveloped XMLDSig verification against the pinned UIDAI public keys →
 * field extraction → cross-check against what the applicant claimed.
 *
 * Spec: UIDAI "Aadhaar Paperless Offline e-KYC".
 *   - `referenceId` = last 4 digits of the Aadhaar number, then a timestamp
 *     `YYYYMMDDHHMMSSmmm` (21 digits total).
 *   - `m` (mobile) = `sha256hex` applied `n` times to `mobile + shareCode`,
 *     where `n` = last digit of the Aadhaar number (0 and 1 both mean 1).
 *   - The document is enveloped-signed: RSA-SHA1 over `SignedInfo`,
 *     SHA-256 digest, C14N `REC-xml-c14n-20010315`.
 *
 * Note this module is deliberately **synchronous** — everything it touches
 * (fs, crypto, XML parsing, RSA verification) is synchronous, so there is no
 * reason to put `await` between the steps and lose the obvious control flow.
 */

/** Uncompressed XML above this is not a real e-KYC pack. */
export const EKYC_MAX_XML_BYTES = 5 * 1024 * 1024;

/** Pack older than this gets a warning (human review), not a rejection. */
export const EKYC_STALE_DAYS = 90;

/** Tolerance before an issued-at in the future is treated as tampering. */
const FUTURE_SKEW_DAYS = 1;

export type EkycStatus = 'pass' | 'review' | 'fail';

export type EkycCode =
  | 'ok'
  | 'bad_share_phrase'
  | 'bad_archive'
  | 'bad_file'
  | 'too_large'
  | 'bad_xml'
  | 'not_ekyc'
  | 'legacy_format'
  | 'no_signature'
  | 'signature_invalid'
  | 'no_trusted_keys'
  | 'bad_structure'
  | 'bad_reference'
  | 'future_pack'
  | 'last4_mismatch'
  | 'dob_mismatch';

export type CheckResult = 'match' | 'mismatch' | 'absent' | 'unparsable' | 'unverified';

export interface EkycCrossCheck {
  last4: CheckResult;
  dob: CheckResult;
  name: CheckResult;
  mobile: CheckResult;
}

export interface EkycData {
  /** Name exactly as signed by UIDAI. */
  name: string;
  /** ISO `yyyy-mm-dd`, or null when the pack carries only a year of birth. */
  dob: string | null;
  /** Year of birth — always present when `dob` is, and present for YoB-only packs. */
  year: number | null;
  dobRaw: string | null;
  /** `M` / `F` / `O`, normalised from whatever UIDAI wrote. */
  gender: string | null;
  /** Last 4 digits of the Aadhaar number, taken from the signed referenceId. */
  last4: string;
  /** `Poa` address attributes, verbatim, empty values dropped. */
  address: Record<string, string>;
  /** Raw base64 of the resident's photo (no `data:` prefix), or null. */
  photo: string | null;
  referenceId: string;
  /** When UIDAI signed the pack, from the referenceId timestamp. */
  issuedAt: string | null;
  ageDays: number | null;
  /** Which pinned UIDAI key verified it, e.g. `UIDAI key 2026`. */
  certLabel: string | null;
}

export interface OfflineEkycResult {
  status: EkycStatus;
  code: EkycCode;
  /** User-facing text, safe to render verbatim. */
  message: string;
  /** Operator-facing context (per-certificate failure reasons, etc.). */
  detail?: string;
  data: EkycData | null;
  crossCheck: EkycCrossCheck;
  warnings: string[];
}

export interface OfflineEkycInput {
  file: Buffer;
  /** Original filename, used only to pick between zip and raw XML. */
  filename?: string | null;
  /** Share phrase protecting the ZIP. Required for a real pack. */
  shareCode: string;
  /** Applicant's claimed mobile, to check against the `m` hash. */
  mobile?: string | null;
  /** Applicant's claimed Aadhaar last 4. The full number is never sent here. */
  expectedLast4?: string | null;
  expectedName?: string | null;
  expectedDob?: string | null;
  /**
   * Override the pinned UIDAI certificates. The self-test uses this to verify
   * against an ephemeral key; production code never sets it, so the only keys
   * that can vouch for a document are the ones bundled in `certs/`.
   */
  trust?: readonly UidaiCert[];
}

// ---------------------------------------------------------------- messages

const MESSAGES: Record<EkycCode, string> = {
  ok: 'Offline e-KYC verified against the UIDAI signature.',
  bad_share_phrase:
    'The Share Phrase is incorrect. It is the code you chose on myAadhaar when you downloaded the file.',
  bad_archive: 'That file could not be opened as an e-KYC archive.',
  bad_file: 'That is not an Aadhaar offline e-KYC pack. Upload the ZIP downloaded from myAadhaar.',
  too_large: 'That file is too large to be an offline e-KYC pack.',
  bad_xml: 'The file could not be read as XML. Please download a fresh pack from myAadhaar.',
  not_ekyc: 'This XML is not an Aadhaar offline e-KYC document.',
  legacy_format:
    'This is an old-format e-KYC file. Please download a fresh pack from myAadhaar.',
  no_signature:
    'This document carries no UIDAI signature. Please download a fresh pack from myAadhaar.',
  signature_invalid:
    "The UIDAI signature on this document could not be verified. It may have been altered — download a fresh pack from myAadhaar.",
  no_trusted_keys: 'Signature verification is unavailable right now. Please try again later.',
  bad_structure:
    'The e-KYC document is missing required details. Please download a fresh pack from myAadhaar.',
  bad_reference:
    'The e-KYC reference number is malformed. Please download a fresh pack from myAadhaar.',
  future_pack:
    'This e-KYC pack is dated in the future. Please download a fresh pack from myAadhaar.',
  last4_mismatch: 'The last 4 digits on this e-KYC pack do not match what you entered.',
  dob_mismatch: 'The date of birth on this e-KYC pack does not match what you entered.',
};

function fail(
  code: EkycCode,
  detail?: string,
  crossCheck?: Partial<EkycCrossCheck>,
  warnings?: string[],
): OfflineEkycResult {
  return {
    status: 'fail',
    code,
    message: MESSAGES[code],
    detail,
    data: null,
    crossCheck: { last4: 'absent', dob: 'absent', name: 'absent', mobile: 'absent', ...crossCheck },
    warnings: warnings ?? [],
  };
}

// ------------------------------------------------------------------ parsing

function looksLikeXml(buf: Buffer): boolean {
  const head = buf.subarray(0, 512).toString('latin1').replace(/^\uFEFF/, '').trimStart();
  return head.startsWith('<');
}

function parseXml(xml: string): Document | null {
  try {
    const doc = new DOMParser({
      // Malformed input is a rejection, not a crash, and it should not spam stderr.
      errorHandler: { warning: () => undefined, error: () => undefined, fatalError: () => undefined },
    }).parseFromString(xml, 'text/xml');
    if (!doc || !doc.documentElement) return null;
    return doc;
  } catch {
    return null;
  }
}

/** Namespace-agnostic local-name search — works with or without `ds:` prefixes. */
function findByLocalName(root: Node, local: string): Element[] {
  const out: Element[] = [];
  const walk = (n: Node): void => {
    if (n.nodeType === 1) {
      const el = n as Element;
      const ln = (el.localName || el.nodeName || '').split(':').pop() ?? '';
      if (ln === local) out.push(el);
    }
    const kids = n.childNodes;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) walk(kids[i]);
  };
  walk(root);
  return out;
}

function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  const v = el.getAttribute(name);
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Build a real calendar date, rejecting 2026-02-30 and friends. */
function realDate(y: number, mo: number, d: number): Date | null {
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export interface DobValue {
  /** `yyyy-mm-dd`, or null for a year-of-birth-only pack. */
  iso: string | null;
  year: number;
}

/**
 * UIDAI writes DOB as `DD-MM-YYYY` (Indian order); residents type it into our
 * form as either `yyyy-mm-dd` (date input) or `DD-MM-YYYY`. Both land on the
 * same ISO value, so order can only bite when both sides are unambiguous.
 */
export function parseDob(raw: string | null | undefined): DobValue | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  if (/^\d{4}$/.test(s)) return { iso: null, year: Number(s) };

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const dt = realDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return dt ? { iso: isoOf(dt), year: dt.getUTCFullYear() } : null;
  }

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const dt = realDate(Number(m[3]), Number(m[2]), Number(m[1]));
    return dt ? { iso: isoOf(dt), year: dt.getUTCFullYear() } : null;
  }

  m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) {
    const dt = realDate(Number(m[3]), Number(m[2]), Number(m[1]));
    return dt ? { iso: isoOf(dt), year: dt.getUTCFullYear() } : null;
  }

  return null;
}

function isoOf(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export interface ReferenceIdParts {
  last4: string;
  issuedAt: Date;
}

/** `last4 + YYYYMMDDHHMMSSmmm` = 21 digits. */
export function parseReferenceId(ref: string): ReferenceIdParts | null {
  if (!/^\d{21}$/.test(ref)) return null;
  const m = /^(\d{4})(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/.exec(ref);
  if (!m) return null;
  const [, last4, Y, Mo, D, H, Mi, S] = m;
  const dt = realDate(Number(Y), Number(Mo), Number(D));
  if (!dt) return null;
  const h = Number(H);
  const mi = Number(Mi);
  const s = Number(S);
  if (h > 23 || mi > 59 || s > 59) return null;
  dt.setUTCHours(h, mi, s, 0);
  return { last4, issuedAt: dt };
}

export function normalizeGender(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (['m', 'male'].includes(v)) return 'M';
  if (['f', 'female'].includes(v)) return 'F';
  if (['o', 'other', 'transgender', 'u', 'unknown'].includes(v)) return 'O';
  return null;
}

// -------------------------------------------------------------- cross-check

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deliberately forgiving: Indian names vary in ordering, initials and
 * honorifics, and a false "mismatch" would block a legitimate applicant.
 * A real mismatch (different person) almost always survives this.
 */
export function namesMatch(a: string, b: string): boolean {
  const A = normalizeName(a);
  const B = normalizeName(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const ta = A.split(' ');
  const tb = B.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const set = new Set(long);
  return short.every((t) => set.has(t));
}

/**
 * UIDAI: `sha256hex` applied `n` times to `value + shareCode`, `n` = last digit
 * of the Aadhaar number (0 or 1 both hash exactly once).
 */
export function computeEkycHash(value: string, shareCode: string, lastAadhaarDigit: number): string {
  const d = Number.isFinite(lastAadhaarDigit) ? Math.trunc(lastAadhaarDigit) : 1;
  const n = Math.max(1, Math.min(9, d));
  let v = `${value}${shareCode}`;
  for (let i = 0; i < n; i++) v = crypto.createHash('sha256').update(v, 'utf8').digest('hex');
  return v;
}

/** Accepts `9800000002`, `+91 98000 00002`, `09800000002`, … */
function mobileCandidates(raw: string): string[] {
  const out = new Set<string>();
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits) {
    if (digits.length === 12 && digits.startsWith('91')) out.add(digits.slice(2));
    if (digits.length === 11 && digits.startsWith('0')) out.add(digits.slice(1));
    if (digits.length > 10) out.add(digits.slice(-10));
    out.add(digits);
  }
  if (trimmed) out.add(trimmed);
  return [...out];
}

function checkMobile(
  claimed: string,
  shareCode: string,
  last4: string,
  expectedHash: string,
): boolean {
  const lastDigit = Number(last4.slice(-1));
  const want = expectedHash.toLowerCase();
  return mobileCandidates(claimed).some((c) => computeEkycHash(c, shareCode, lastDigit) === want);
}

// ---------------------------------------------------------------- signature

function verifySignature(
  xml: string,
  certs: readonly UidaiCert[],
): { cert: UidaiCert | null; detail?: string } {
  if (certs.length === 0) return { cert: null, detail: 'no UIDAI certificates are configured' };

  const doc = parseXml(xml);
  const sigNodes = doc ? findByLocalName(doc, 'Signature') : [];
  if (sigNodes.length === 0) return { cert: null, detail: 'document contains no <Signature> element' };

  const errors: string[] = [];
  for (const cert of certs) {
    try {
      const sig = new SignedXml();
      /**
       * Pin the trust anchor. xml-crypto will happily pull an X.509 certificate
       * out of the document's own `<KeyInfo>` and verify against *that*, which
       * would let anyone sign a pack with their own key. Only our bundled UIDAI
       * certificates are allowed to vouch for a document.
       */
      sig.getCertFromKeyInfo = ((): null => null) as unknown as typeof SignedXml.getCertFromKeyInfo;
      sig.publicCert = cert.pem;
      sig.loadSignature(sigNodes[0]);
      if (sig.checkSignature(xml)) return { cert };
      errors.push(`${cert.label}: rejected`);
    } catch (e) {
      errors.push(`${cert.label}: ${(e as Error).message}`);
    }
  }
  return { cert: null, detail: errors.join('; ') };
}

// --------------------------------------------------------------------- main

/**
 * Verify an offline e-KYC upload end to end.
 *
 * Never throws: every failure path comes back as `status: 'fail'` with a
 * user-safe `message` and a machine-readable `code`.
 */
export function verifyOfflineEkyc(input: OfflineEkycInput): OfflineEkycResult {
  const cross: EkycCrossCheck = { last4: 'absent', dob: 'absent', name: 'absent', mobile: 'absent' };
  const warnings: string[] = [];

  if (!input.file || input.file.length === 0) return fail('bad_file', 'empty upload', cross);

  // ---- 1. get the XML out -------------------------------------------------
  let xml: string;
  if (looksLikeZip(input.file)) {
    try {
      const entry = unzipOfflinePack(input.file, input.shareCode ?? '');
      xml = entry.data.toString('utf8');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const sharePhrase = e instanceof ZipError && /share phrase|password/i.test(msg);
      return fail(sharePhrase ? 'bad_share_phrase' : 'bad_archive', msg, cross);
    }
  } else if (looksLikeXml(input.file)) {
    xml = input.file.toString('utf8');
  } else {
    return fail('bad_file', `unrecognised file type (${input.filename ?? 'unknown name'})`, cross);
  }

  if (Buffer.byteLength(xml, 'utf8') > EKYC_MAX_XML_BYTES) return fail('too_large', undefined, cross);

  // ---- 2. parse ----------------------------------------------------------
  const doc = parseXml(xml);
  if (!doc) return fail('bad_xml', 'DOMParser returned no document', cross);
  const root = doc.documentElement;
  const rootName = (root.localName || root.nodeName || '').split(':').pop() ?? '';
  if (rootName !== 'OfflinePaperlessKyc') {
    return fail('not_ekyc', `root element is <${root.nodeName}>`, cross);
  }
  if (attr(root, 's')) return fail('legacy_format', 'legacy s="…" attribute signature', cross);

  // ---- 3. signature (the whole point) ------------------------------------
  const sig = verifySignature(xml, input.trust ?? loadUidaiCerts());
  if (!sig.cert) {
    const code: EkycCode =
      sig.detail?.includes('no <Signature>') || sig.detail?.includes('no UIDAI certificates')
        ? sig.detail.includes('no UIDAI certificates')
          ? 'no_trusted_keys'
          : 'no_signature'
        : 'signature_invalid';
    return fail(code, sig.detail, cross);
  }

  // ---- 4. structure ------------------------------------------------------
  const uidData = findByLocalName(root, 'UidData')[0] ?? null;
  const poi = uidData ? (findByLocalName(uidData, 'Poi')[0] ?? null) : null;
  if (!uidData || !poi) return fail('bad_structure', 'missing UidData/Poi', cross, warnings);

  const name = attr(poi, 'name');
  if (!name) return fail('bad_structure', 'Poi has no name attribute', cross, warnings);

  const poa = findByLocalName(uidData, 'Poa')[0] ?? null;
  const pht = findByLocalName(uidData, 'Pht')[0] ?? null;
  if (!poa) warnings.push('The pack contains no address section.');
  if (!pht) warnings.push('The pack contains no photo.');
  const dobRaw = attr(poi, 'dob');
  if (!dobRaw) warnings.push('The pack contains no date of birth.');

  // ---- 5. reference id -> last 4 + issued-at -----------------------------
  const ref = attr(root, 'referenceId');
  const parsed = ref ? parseReferenceId(ref) : null;
  if (!ref || !parsed) return fail('bad_reference', `referenceId=${ref ?? '(absent)'}`, cross, warnings);

  const now = Date.now();
  const ageDays = (now - parsed.issuedAt.getTime()) / 86_400_000;
  if (ageDays < -FUTURE_SKEW_DAYS) {
    return fail('future_pack', `issued ${(-ageDays).toFixed(1)} days in the future`, cross, warnings);
  }
  if (ageDays > EKYC_STALE_DAYS) {
    warnings.push(`This e-KYC pack was issued ${Math.round(ageDays)} days ago.`);
  }

  // ---- 6. photo ----------------------------------------------------------
  let photo: string | null = null;
  if (pht) {
    let raw = (pht.textContent ?? '').replace(/\s+/g, '');
    const dataUrl = /^data:[^;]*;base64,(.*)$/i.exec(raw);
    if (dataUrl) raw = dataUrl[1];
    photo = raw.length > 0 ? raw : null;
  }

  // ---- 7. cross-checks ---------------------------------------------------
  const last4 = parsed.last4;

  const claimedLast4 = (input.expectedLast4 ?? '').replace(/\D/g, '');
  if (claimedLast4.length === 4) {
    cross.last4 = claimedLast4 === last4 ? 'match' : 'mismatch';
  }

  const packDob = parseDob(dobRaw);
  const claimedDob = parseDob(input.expectedDob ?? null);
  if (input.expectedDob && String(input.expectedDob).trim()) {
    if (!packDob || !claimedDob) cross.dob = 'unparsable';
    else if (packDob.year !== claimedDob.year) cross.dob = 'mismatch';
    else if (packDob.iso && claimedDob.iso) cross.dob = packDob.iso === claimedDob.iso ? 'match' : 'mismatch';
    else cross.dob = 'match'; // year-of-birth-only pack — year agreement is all we can check
  }

  const claimedName = (input.expectedName ?? '').trim();
  if (claimedName) cross.name = namesMatch(claimedName, name) ? 'match' : 'mismatch';

  const mobileHash = attr(poi, 'm');
  const claimedMobile = (input.mobile ?? '').trim();
  if (!mobileHash) cross.mobile = 'absent';
  else if (!claimedMobile) cross.mobile = 'unverified';
  else cross.mobile = checkMobile(claimedMobile, input.shareCode ?? '', last4, mobileHash)
    ? 'match'
    : 'mismatch';

  // ---- 8. verdict --------------------------------------------------------
  if (cross.last4 === 'mismatch') {
    return fail('last4_mismatch', `pack=${last4} claimed=${claimedLast4}`, cross, warnings);
  }
  if (cross.dob === 'mismatch') {
    return fail(
      'dob_mismatch',
      `pack=${packDob?.iso ?? dobRaw} claimed=${claimedDob?.iso ?? input.expectedDob}`,
      cross,
      warnings,
    );
  }
  if (cross.name === 'mismatch') warnings.push(`Name on the pack ("${name}") differs from what was entered.`);
  if (cross.mobile === 'mismatch') warnings.push('The mobile number does not match the hash in the pack.');

  const address: Record<string, string> = {};
  if (poa) {
    for (let i = 0; i < poa.attributes.length; i++) {
      const a = poa.attributes.item(i);
      if (!a) continue;
      const v = (a.value ?? '').trim();
      if (v) address[a.name] = v;
    }
  }

  const hasWarnings = warnings.length > 0;

  return {
    status: hasWarnings ? 'review' : 'pass',
    code: 'ok',
    message: MESSAGES.ok,
    detail: `verified by ${sig.cert.label}`,
    data: {
      name,
      dob: packDob?.iso ?? null,
      year: packDob?.year ?? null,
      dobRaw,
      gender: normalizeGender(attr(poi, 'gender')),
      last4,
      address,
      photo,
      referenceId: ref,
      issuedAt: parsed.issuedAt.toISOString(),
      ageDays: Math.round(ageDays),
      certLabel: sig.cert.label,
    },
    crossCheck: cross,
    warnings,
  };
}
