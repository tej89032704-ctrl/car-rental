/**
 * End-to-end check of the KYC wiring over real HTTP against the running API:
 * sign-up, Tier 1 validation on `POST /kyc/documents`, and the offline e-KYC
 * endpoint — plus the policy that an Aadhaar document fills the ID-proof slot.
 *
 * Self-cleaning: the test account, its documents, its uploads and its OTPs are
 * removed on the way out and again if anything throws. Run with:
 *   npx tsx scripts/kyc-e2e.ts
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { verhoeffCheckDigit } from '../apps/api/src/common/kyc/verhoeff';

const BASE = 'http://localhost:4000';
const PSQL = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const EMAIL = 'kyc-e2e@test.local';
const PHONE = '+919000000007';
const PASSWORD = 'KycE2e@12345';
const FIXTURE = path.resolve('scripts/fixtures/zipcrypto_offline_ekyc.zip');
const UPLOADS = path.resolve('apps/api/uploads');

const RUN_STARTED_AT = new Date().toISOString();
const FUTURE = '2030-06-15';
const PAST = '2019-01-01';

/** Local Postgres password comes from the environment, never from source. */
function pgPassword(): string {
  const p = process.env.PGPASSWORD || process.env.CR_LOCAL_PG_PASSWORD || '';
  if (!p) throw new Error('Set CR_LOCAL_PG_PASSWORD (or PGPASSWORD) to run this script.');
  return p;
}
/** 11 digits, made a valid Aadhaar by appending the Verhoeff check digit. */
const AADHAAR = `43219876543${verhoeffCheckDigit('43219876543')}`;
/** 1x1 transparent PNG — enough to be a real upload. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** [schema.table, column] pairs that can hold a reference to a user row. */
const USER_TABLES: [string, string][] = [
  ['auth.otp_verifications', 'user_id'],
  ['auth.sessions', 'user_id'],
  ['auth.kyc_documents', 'user_id'],
  ['auth.role_change_requests', 'user_id'],
  ['auth.audit_logs', 'created_by'],
  ['booking.bookings', 'renter_id'],
  ['booking.bookings', 'owner_id'],
  ['payment.wallets', 'user_id'],
  ['payment.subscriptions', 'user_id'],
  ['notification.notifications', 'user_id'],
  ['notification.push_tokens', 'user_id'],
  ['notification.sms_logs', 'created_by'],
];

function sql(query: string): string {
  const out = execFileSync(
    PSQL,
    ['-U', 'postgres', '-h', '127.0.0.1', '-d', 'cr_dev', '-t', '-A', '-c', query],
    { env: { ...process.env, PGPASSWORD: pgPassword() }, encoding: 'utf8' },
  );
  // psql writes CRLF on Windows: an un-stripped \r on intermediate lines makes
  // `id IN (...)` silently match nothing.
  return out.replace(/\r/g, '').trim();
}

function cleanup(): void {
  const ids = sql(`SELECT id FROM auth.users WHERE email='${EMAIL}'`)
    .split('\n').filter(Boolean);
  if (ids.length) {
    const list = ids.map((i) => `'${i}'`).join(',');
    const urls = sql(
      `SELECT file_url FROM auth.kyc_documents WHERE user_id IN (${list}) AND file_url <> ''`,
    ).split('\n').filter(Boolean);
    for (const [table, col] of USER_TABLES) sql(`DELETE FROM ${table} WHERE ${col} IN (${list})`);
    sql(`DELETE FROM auth.users WHERE id IN (${list})`);
    for (const url of urls) {
      const file = path.join(UPLOADS, path.basename(url));
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* best effort */ }
    }
  }
  sql(`DELETE FROM notification.sms_logs WHERE to_phone='${PHONE}'`);
  sql(`DELETE FROM auth.otp_verifications WHERE created_at >= '${RUN_STARTED_AT}'`);
  sql(`DELETE FROM auth.sessions WHERE created_at >= '${RUN_STARTED_AT}'`);
}

function countDocs(): number {
  return Number(sql(
    `SELECT count(*) FROM auth.kyc_documents d JOIN auth.users u ON u.id = d.user_id WHERE u.email='${EMAIL}'`,
  ) || 0);
}

let pass = 0;
const fails: string[] = [];

function ok(label: string, cond: boolean, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else {
    fails.push(label);
    console.log(`  FAIL ${label}${extra === undefined ? '' : '  ' + JSON.stringify(extra)}`);
  }
}

interface CallOpts { method?: string; token?: string; body?: unknown; form?: FormData; }

async function call(route: string, opts: CallOpts = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form; // never set content-type: fetch adds the boundary
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(BASE + route, { method: opts.method ?? 'GET', headers, body });
  let json: any = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}

function docForm(fields: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'card.png');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);
  return fd;
}

function ekycForm(phrase: string, withFile = true): FormData {
  const fd = new FormData();
  if (withFile) {
    fd.append(
      'file',
      new Blob([new Uint8Array(fs.readFileSync(FIXTURE))], { type: 'application/zip' }),
      'offlineaadhaar.zip',
    );
  }
  fd.append('share_code', phrase);
  return fd;
}

async function main(): Promise<void> {
  cleanup(); // idempotent — a previous crashed run must not poison this one

  // ---- identity ----------------------------------------------------------
  const signup = await call('/auth/signup', {
    method: 'POST',
    body: { name: 'KYC E2E', email: EMAIL, phone: PHONE, password: PASSWORD, role: 'car_renter' },
  });
  ok('POST /auth/signup', [200, 201].includes(signup.status), signup);
  // Registration has no OTP step any more, so there is no code to return.
  ok('no OTP required at signup', !signup.json?.dev_otp, signup.json);

  const login = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  ok('POST /auth/login', login.status === 200, login.status);
  const token = login.json?.access_token ?? login.json?.token;
  ok('token issued', Boolean(token));
  if (!token) throw new Error('no token — cannot continue');


  // kyc_status is still 'pending' here: the KYC routes are @KycExempt, which is
  // the whole reason a fresh sign-up can file documents at all.
  const me0 = await call('/kyc/me', { token });
  ok('GET /kyc/me while KYC pending (exempt from the gate)', me0.status === 200, me0.status);
  ok('no documents yet', (me0.json?.documents ?? []).length === 0, me0.json?.documents?.length);
  ok(
    'required docs unchanged',
    JSON.stringify(me0.json?.required_docs) === '["id_proof","address_proof"]',
    me0.json?.required_docs,
  );

  // ---- offline e-KYC: rejections first, so "persisted nothing" is provable --
  const noShare = await call('/kyc/offline-ekyc', { method: 'POST', token, form: ekycForm('', false) });
  ok('e-KYC without share_code -> 400', noShare.status === 400, noShare);
  ok('  message names share_code', /share_code|share code/i.test(noShare.json?.message ?? ''), noShare.json);

  const noFile = await call('/kyc/offline-ekyc', { method: 'POST', token, form: ekycForm('1234', false) });
  ok('e-KYC without a file -> 400', noFile.status === 400, noFile);

  const wrongPhrase = await call('/kyc/offline-ekyc', { method: 'POST', token, form: ekycForm('000000') });
  ok('e-KYC wrong share code -> 200 domain result', wrongPhrase.status === 200, wrongPhrase);
  ok('  code = bad_share_phrase', wrongPhrase.json?.code === 'bad_share_phrase', wrongPhrase.json);
  ok('  status = fail', wrongPhrase.json?.status === 'fail', wrongPhrase.json?.status);

  const unsigned = await call('/kyc/offline-ekyc', { method: 'POST', token, form: ekycForm('Share@1234') });
  ok('e-KYC right share code, unsigned pack -> no_signature', unsigned.json?.code === 'no_signature', unsigned.json);
  ok('  status = fail', unsigned.json?.status === 'fail', unsigned.json?.status);
  ok('  nothing persisted on failure', countDocs() === 0, countDocs());

  // ---- unknown doc type ---------------------------------------------------
  const junk = await call('/kyc/documents', { method: 'POST', token, form: docForm({ doc_type: 'banana' }) });
  ok('unknown doc_type -> 400', junk.status === 400, junk);
  ok('  still nothing persisted', countDocs() === 0, countDocs());

  // ---- id_proof, unchanged from before this feature -----------------------
  const idProof = await call('/kyc/documents', { method: 'POST', token, form: docForm({ doc_type: 'id_proof' }) });
  ok('id_proof with no number still accepted', [200, 201].includes(idProof.status), idProof);
  ok('  no number, no verdict', idProof.json?.doc_number === null && idProof.json?.verify_status === null, idProof.json);
  ok('  one document filed', countDocs() === 1, countDocs());

  // ---- Aadhaar, Tier 1 ----------------------------------------------------
  const badAadhaar = await call('/kyc/documents', {
    method: 'POST', token, form: docForm({ doc_type: 'aadhaar', doc_number: '123456789012' }),
  });
  ok('Aadhaar failing Verhoeff -> 400', badAadhaar.status === 400, badAadhaar);
  ok('  explains itself', Boolean(badAadhaar.json?.message), badAadhaar.json);

  const goodAadhaar = await call('/kyc/documents', {
    method: 'POST', token, form: docForm({ doc_type: 'aadhaar', doc_number: AADHAAR }),
  });
  ok('valid Aadhaar accepted', [200, 201].includes(goodAadhaar.status), goodAadhaar);
  ok('  stored masked only', goodAadhaar.json?.doc_number === `XXXX XXXX ${AADHAAR.slice(-4)}`, goodAadhaar.json?.doc_number);
  ok('  verify_status = pass', goodAadhaar.json?.verify_status === 'pass', goodAadhaar.json);
  ok('  detail says checksum verified', /checksum/i.test(goodAadhaar.json?.verify_detail ?? ''), goodAadhaar.json);
  ok('  two documents filed', countDocs() === 2, countDocs());

  const masked = await call('/kyc/documents', {
    method: 'POST', token, form: docForm({ doc_type: 'aadhaar', doc_number: `XXXX XXXX ${AADHAAR.slice(-4)}` }),
  });
  ok('masked Aadhaar accepted', [200, 201].includes(masked.status), masked);
  ok('  flagged review — nothing to checksum', masked.json?.verify_status === 'review', masked.json);
  ok('  replaces rather than duplicates', countDocs() === 2, countDocs());

  // Aadhaar Act 2016 s.29(3): the full 12 digits must not exist anywhere.
  ok(
    'no full 12-digit number stored anywhere',
    sql(`SELECT count(*) FROM auth.kyc_documents WHERE doc_number ~ '^[0-9]{12}$'`) === '0',
  );

  // ---- driving licence, Tier 1 -------------------------------------------
  const noExpiry = await call('/kyc/documents', {
    method: 'POST', token, form: docForm({ doc_type: 'driving_license', doc_number: 'KA0120190012345' }),
  });
  ok('DL without expiry -> 400', noExpiry.status === 400, noExpiry);
  ok('  message names expiry', /expiry/i.test(noExpiry.json?.message ?? ''), noExpiry.json);

  const badState = await call('/kyc/documents', {
    method: 'POST', token, form: docForm({ doc_type: 'driving_license', doc_number: 'ZZ0120190012345', doc_expiry: FUTURE }),
  });
  ok('DL with unknown state code -> 400', badState.status === 400, badState);
  ok('  names the state code', /state code/i.test(badState.json?.message ?? ''), badState.json);

  const expired = await call('/kyc/documents', {
    method: 'POST', token, form: docForm({ doc_type: 'driving_license', doc_number: 'KA0120190012345', doc_expiry: PAST }),
  });
  ok('expired DL -> 400', expired.status === 400, expired);
  ok('  names the expiry', /expired/i.test(expired.json?.message ?? ''), expired.json);

  const goodDl = await call('/kyc/documents', {
    method: 'POST', token, form: docForm({ doc_type: 'driving_license', doc_number: 'ka 01 2019 0012345', doc_expiry: FUTURE }),
  });
  ok('valid DL accepted', [200, 201].includes(goodDl.status), goodDl);
  ok('  number normalised', goodDl.json?.doc_number === 'KA0120190012345', goodDl.json?.doc_number);
  ok('  expiry normalised', goodDl.json?.doc_expiry === FUTURE, goodDl.json?.doc_expiry);
  ok('  verify_status = pass', goodDl.json?.verify_status === 'pass', goodDl.json);
  ok('  detail carries the state', /\bKA\b/.test(goodDl.json?.verify_detail ?? ''), goodDl.json?.verify_detail);
  ok('  three documents filed', countDocs() === 3, countDocs());

  // Read the queue while these are still pending — approving them below is
  // what makes them disappear from it.
  const adminTok = await adminToken();
  if (adminTok) {
    const queue = await call('/kyc/queue', { token: adminTok });
    ok('admin queue reachable', queue.status === 200, queue.status);
    const mine = (queue.json ?? []).find((d: any) => d.doc_number === `XXXX XXXX ${AADHAAR.slice(-4)}`);
    ok('  masked number visible to reviewers', Boolean(mine?.doc_number), mine);
    // The masked re-submission above replaced the checksum-verified row, so
    // this is the honest verdict for what is stored now.
    ok('  verify_status visible to reviewers', mine?.verify_status === 'review', mine?.verify_status);
    ok('  verify_detail carried through', Boolean(mine?.verify_detail), mine?.verify_detail);
    const dlRow = (queue.json ?? []).find((d: any) => d.doc_number === 'KA0120190012345');
    ok('  expiry visible to reviewers', Boolean(dlRow?.doc_expiry), dlRow?.doc_expiry);
  } else {
    console.log('  skip admin-queue check (super_admin token unavailable)');
  }

  // ---- the policy claim: Aadhaar fills the ID-proof slot ------------------
  const addr = await call('/kyc/documents', { method: 'POST', token, form: docForm({ doc_type: 'address_proof' }) });
  ok('address_proof accepted', [200, 201].includes(addr.status), addr);

  sql(`UPDATE auth.kyc_documents SET status='approved' WHERE user_id=(SELECT id FROM auth.users WHERE email='${EMAIL}')`);
  const complete = await call('/kyc/me', { token });
  ok('aadhaar satisfies the id_proof slot (complete = true)', complete.json?.complete === true, {
    complete: complete.json?.complete,
    types: (complete.json?.documents ?? []).map((d: any) => `${d.doc_type}:${d.status}`),
  });

}

/** Admin login is 2FA: the code lands in sms_logs, not in the response. */
async function adminToken(): Promise<string | undefined> {
  const since = new Date().toISOString();
  const login = await call('/auth/admin/login', {
    method: 'POST',
    body: { email: 'admin@platform.local', password: 'Admin@12345' },
  });
  const twofa = login.json?.twofa_token;
  if (!twofa) return undefined;
  const code = sql(
    `SELECT body FROM notification.sms_logs WHERE body LIKE '%admin login verification code%'`
    + ` AND created_at >= '${since}' ORDER BY created_at DESC LIMIT 1`,
  ).match(/code is (\d+)/)?.[1];
  if (!code) return undefined;
  const verify = await call('/auth/admin/login/verify', {
    method: 'POST', body: { twofa_token: twofa, code: String(code) },
  });
  return verify.json?.token ?? verify.json?.access_token;
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (e: any) {
    fails.push(`unexpected error: ${e?.message ?? String(e)}`);
    console.error(e);
  } finally {
    cleanup();
  }

  console.log('');
  console.log(`${pass} passed, ${fails.length} failed`);
  if (fails.length) {
    console.log('FAILED:');
    for (const f of fails) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

void run();
