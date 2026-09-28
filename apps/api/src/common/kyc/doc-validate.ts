import { verhoeffValidate } from './verhoeff';

/**
 * Structural validation for the two documents a rental platform must check
 * before handing over keys: an Aadhaar number and a driving licence.
 *
 * What this does and does not prove
 * ----------------------------------
 * `validateAadhaar` proves the 12 digits are shaped like an Aadhaar number and
 * carry a correct Verhoeff checksum — i.e. it is not a typo and not a random
 * guess. It does *not* prove the number exists: UIDAI publishes no open API for
 * that, and the only licensed route (AUA/KUA) is a contract, not a key. For
 * proof that the card is genuine, see `aadhaar-ekyc.ts`, which verifies UIDAI's
 * signature on the Paperless Offline e-KYC XML.
 *
 * `validateDrivingLicense` proves the number parses as a Parivahan-style licence
 * for a real state and that its printed validity window is sane. The
 * authoritative check (DL number against the Parivahan/Sarathi database) is not
 * publicly available either.
 *
 * Compliance: the Aadhaar Act 2016 s.29(3) forbids storing a complete Aadhaar
 * number. Nothing here ever returns or persists all 12 digits — only
 * {@link maskAadhaar}'d `XXXX XXXX 1234`, i.e. the last 4.
 */

export interface AadhaarResult {
  ok: boolean;
  error?: string;
  /** `XXXX XXXX 1234` — the only form that may be stored or displayed. */
  masked: string;
  last4: string;
  /**
   * `checksum_ok` — full number supplied, Verhoeff check digit verified.
   * `masked_only` — user only has a masked card, so only the last 4 exist.
   *                No checksum is possible; reviewers should treat it as weaker.
   * `none` — rejected.
   */
  strength: 'checksum_ok' | 'masked_only' | 'none';
}

export interface DlResult {
  ok: boolean;
  error?: string;
  /** Normalised (uppercased, unspaced). Driving licence numbers are not restricted, so this is stored whole. */
  number: string;
  /**
   * `strict` — state + RTO + plausible issue year + serial all parsed.
   * `loose`  — state + digits parse, but no year-shaped group (older formats).
   * `none`   — rejected.
   */
  pattern: 'strict' | 'loose' | 'none';
  state: string;
  /** Present only when `pattern` is `strict`. */
  issueYear?: number;
  expiry: string;
  /** Days until the printed `valid up to` date; negative means expired. */
  daysToExpiry: number;
}

/** Storage/display form. The full 12 digits never leave this function. */
export function maskAadhaar(last4: string): string {
  return `XXXX XXXX ${last4}`;
}

/** Human label for the reviewer badge. */
export function strengthLabel(strength: AadhaarResult['strength']): string {
  if (strength === 'checksum_ok') return 'checksum verified';
  if (strength === 'masked_only') return 'last 4 only';
  return 'not validated';
}

/**
 * Issuer-recognised 2-letter RTO state/UT codes: current plus the legacy codes
 * still printed on licences issued before the renames (Odisha `OR`,
 * Uttarakhand `UA`, Dadra & Nagar Haveli `DN`).
 */
const STATE_CODES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR',
  'JK', 'JH', 'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR',
  'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UA', 'UK', 'UP', 'WB',
]);

/** `KA` + 10-14 digits. The RTO/year/serial split is resolved by search, not by one regex — see {@link parseRtoYearSerial}. */
const DL_SHAPE = /^([A-Z]{2})(\d{10,14})$/;
/** Older state formats that carry letters; accepted but reported as `loose`. */
const DL_SHAPE_ALNUM = /^([A-Z]{2})(?=[0-9A-Z]*\d)[0-9A-Z]{10,15}$/;

const MS_DAY = 86_400_000;
const MAX_YEARS_AHEAD = 40;
const MIN_ISSUE_YEAR = 1980;

function currentYear(): number {
  return new Date().getUTCFullYear();
}

function badAadhaar(error: string): AadhaarResult {
  return { ok: false, error, masked: '', last4: '', strength: 'none' };
}

function badDl(error: string): DlResult {
  return { ok: false, error, number: '', pattern: 'none', state: '', expiry: '', daysToExpiry: 0 };
}

/**
 * Validate an Aadhaar number.
 *
 * Accepts `123456789012`, `1234 5678 9012`, `1234-5678-9012`, and the masked
 * `XXXX XXXX 1234` printed on current cards.
 */
export function validateAadhaar(raw: string): AadhaarResult {
  const input = String(raw ?? '').trim();
  if (!input) return badAadhaar('Aadhaar number is required');

  // A masked card physically does not contain digits 1-8, so no checksum can be
  // run against it. Accept the last 4 and record the weaker strength — the
  // offline e-KYC XML path is what supplies strong evidence in that case.
  if (/[xX]{3,}/.test(input)) {
    const tail = input.replace(/\D/g, '');
    if (tail.length !== 4) {
      return badAadhaar('Masked Aadhaar must be the last 4 digits, e.g. XXXX XXXX 1234');
    }
    if (tail === '0000') return badAadhaar('Those are not the last 4 digits of an Aadhaar number');
    return { ok: true, masked: maskAadhaar(tail), last4: tail, strength: 'masked_only' };
  }

  const digits = input.replace(/\D/g, '');
  if (digits.length !== 12) {
    return badAadhaar(`Aadhaar number must be 12 digits (got ${digits.length})`);
  }
  if (/^0+$|^1+$/.test(digits)) return badAadhaar('That is not a valid Aadhaar number');
  if (!verhoeffValidate(digits)) {
    return badAadhaar('Invalid Aadhaar number — the last digit fails the checksum, please re-check the number you typed');
  }

  return { ok: true, masked: maskAadhaar(digits.slice(8)), last4: digits.slice(8), strength: 'checksum_ok' };
}

/**
 * A Parivahan licence number is `state(2) + RTO(2-4) + year(4) + serial(5-9)`.
 * A single regex cannot resolve that ambiguity: against `KA0120190012345` a
 * greedy `(\d{2,4})(\d{4})(\d{5,9})` binds RTO=`0120`, year=`1900` and then
 * rejects a perfectly good licence. So every legal split is tried in order of
 * preference (2-digit RTO is the overwhelming norm) and the first one whose year
 * is plausible wins.
 *
 * Returns `{ rtoLen, year, serialLen }` or null.
 */
function parseRtoYearSerial(digits: string): { rtoLen: number; year: number; serialLen: number } | null {
  const year = currentYear();
  for (const rtoLen of [2, 3, 4]) {
    const serialLen = digits.length - rtoLen - 4;
    if (serialLen < 5 || serialLen > 9) continue;
    const issueYear = Number(digits.slice(rtoLen, rtoLen + 4));
    if (issueYear >= MIN_ISSUE_YEAR && issueYear <= year + 1) return { rtoLen, year: issueYear, serialLen };
  }
  return null;
}

/** The year-shaped group, when there is one but it is out of range. */
function implausibleYearCandidate(digits: string): number | null {
  for (const rtoLen of [2, 3, 4]) {
    const serialLen = digits.length - rtoLen - 4;
    if (serialLen < 5 || serialLen > 9) continue;
    const y = Number(digits.slice(rtoLen, rtoLen + 4));
    // Anything that reads as a year at all was meant to be one, so 2099 counts
    // even though it is far outside the plausible window.
    if (y >= 1900 && y <= 2100) return y;
  }
  return null;
}

function parseDateOnly(value: string): Date | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  let y: number, m: number, day: number;
  if (iso) { y = +iso[1]; m = +iso[2]; day = +iso[3]; }
  else if (dmy) { day = +dmy[1]; m = +dmy[2]; y = +dmy[3]; }
  else return null;

  const dt = new Date(Date.UTC(y, m - 1, day));
  // Rejects 2026-02-30, 2026-13-01, etc.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) return null;
  return dt;
}

/**
 * Validate a driving licence number and its printed validity.
 *
 * `expiryIso` (YYYY-MM-DD) is required: an unexpired licence is the entire
 * point of checking one, and a rental platform that accepts an expired DL is
 * handing keys to someone who may not legally drive.
 */
export function validateDrivingLicense(raw: string, expiryIso: string): DlResult {
  const input = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
  if (!input) return badDl('Driving licence number is required');

  const state = input.slice(0, 2);
  if (!STATE_CODES.has(state)) {
    return badDl(`Unknown state code "${state}" at the start of the licence number`);
  }

  const shape = DL_SHAPE.exec(input);
  let pattern: DlResult['pattern'] = 'loose';
  let issueYear: number | undefined;

  if (shape) {
    const digits = shape[2];
    const strict = parseRtoYearSerial(digits);
    if (strict) {
      pattern = 'strict';
      issueYear = strict.year;
    } else {
      const suspect = implausibleYearCandidate(digits);
      if (suspect !== null) {
        return badDl(`Issue year ${suspect} in the licence number is not plausible (expected ${MIN_ISSUE_YEAR}-${currentYear() + 1})`);
      }
      // No year-shaped group anywhere: an older state format. Accept, flagged.
      pattern = 'loose';
    }
  } else if (!DL_SHAPE_ALNUM.test(input)) {
    return badDl('Not a valid driving licence number — expected a 2-letter state code followed by 10-15 characters, e.g. KA0120190012345');
  }

  const expiryDate = parseDateOnly(expiryIso);
  if (!expiryDate) {
    return badDl('Licence expiry date is required and must be a real date, as YYYY-MM-DD');
  }
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysToExpiry = Math.floor((expiryDate.getTime() - today) / MS_DAY);
  if (daysToExpiry < 0) {
    return badDl(`Licence expired on ${expiryDate.toISOString().slice(0, 10)} — an unexpired licence is required`);
  }
  if (daysToExpiry > MAX_YEARS_AHEAD * 365) {
    return badDl(`Expiry ${expiryDate.toISOString().slice(0, 10)} is more than ${MAX_YEARS_AHEAD} years away, which cannot be right`);
  }

  return {
    ok: true, number: input, pattern, state, issueYear,
    expiry: expiryDate.toISOString().slice(0, 10), daysToExpiry,
  };
}

/** Exposed for the unit checks in `kyc.selftest.mjs`. */
export const __internals = { STATE_CODES, parseRtoYearSerial, implausibleYearCandidate, parseDateOnly };
