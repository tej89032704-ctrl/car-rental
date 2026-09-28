/**
 * End-to-end check of the mutual review system over real HTTP:
 *
 *  - renter books → owner approves → trip runs → completes
 *  - the renter's one submission rates BOTH the car and the owner
 *  - the owner's submission rates the renter
 *  - the car's rating surfaces in /cars/search while others book it
 *  - a NEW incoming request carries the requesting renter's rating + comments
 *
 * Self-cleaning: bookings, reviews, payment rows, the car and both test
 * accounts are removed on the way out and again if anything throws. Run with:
 *   npx tsx scripts/reviews-e2e.ts
 *
 * Requires the API to be up (localhost:4000), migrations applied, and
 * CR_LOCAL_PG_PASSWORD (or PGPASSWORD) set for the psql cleanup helpers.
 */
import { execFileSync } from 'node:child_process';

const BASE = 'http://localhost:4000';
const PSQL = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const OWNER_EMAIL = 'reviews-e2e-owner@test.local';
const OWNER_PHONE = '+919000000012';
const OWNER_PASSWORD = 'ReviewsE2e@12345';
const RENTER_EMAIL = 'reviews-e2e-renter@test.local';
const RENTER_PHONE = '+919000000011';
const RENTER_PASSWORD = 'ReviewsE2e@12345';
const PLATE = `UP32RV${String(Date.now() % 900 + 100)}`;

const RUN_STARTED_AT = new Date().toISOString();

function pgPassword(): string {
  const p = process.env.PGPASSWORD || process.env.CR_LOCAL_PG_PASSWORD || '';
  if (!p) throw new Error('Set CR_LOCAL_PG_PASSWORD (or PGPASSWORD) to run this script.');
  return p;
}

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

const baseline = {
  users: sql(`SELECT COUNT(*) FROM auth.users`),
  bookings: sql(`SELECT COUNT(*) FROM booking.bookings`),
  refunds: sql(`SELECT COUNT(*) FROM payment.refunds`),
};

/** Every table that can reference the test owner/renter or the test car. */
const USER_TABLES: [string, string][] = [
  ['auth.otp_verifications', 'user_id'],
  ['auth.sessions', 'user_id'],
  ['auth.kyc_documents', 'user_id'],
  ['auth.role_change_requests', 'user_id'],
  ['auth.audit_logs', 'created_by'],
  ['booking.bookings', 'renter_id'],
  ['booking.bookings', 'owner_id'],
  ['booking.reviews', 'reviewer_id'],
  ['booking.reviews', 'target_user_id'],
  ['booking.reviews', 'created_by'],
  ['booking.disputes', 'raised_by'],
  ['booking.disputes', 'against_user_id'],
  ['payment.wallets', 'user_id'],
  ['payment.subscriptions', 'user_id'],
  ['payment.audit_logs', 'created_by'],
  ['notification.notifications', 'user_id'],
  ['notification.push_tokens', 'user_id'],
  ['notification.sms_logs', 'created_by'],
  ['fleet.audit_logs', 'created_by'],
];

const CAR_TABLES: [string, string][] = [
  ['fleet.cars', 'id'],
  ['fleet.car_photos', 'car_id'],
  ['fleet.car_documents', 'car_id'],
  ['fleet.car_pricing', 'car_id'],
  ['fleet.car_availability', 'car_id'],
  ['fleet.car_verifications', 'car_id'],
  ['fleet.audit_logs', 'entity_id'],
  ['booking.car_cache', 'id'],
];

function cleanup(): void {
  const uids = sql(
    `SELECT id FROM auth.users WHERE email IN ('${OWNER_EMAIL}','${RENTER_EMAIL}')`,
  ).split('\n').filter(Boolean);
  let carIds = sql(`SELECT id FROM fleet.cars WHERE plate_number='${PLATE}'`).split('\n').filter(Boolean);
  if (!carIds.length && uids.length) {
    carIds = sql(`SELECT id FROM fleet.cars WHERE owner_id IN (${uids.map((i) => `'${i}'`).join(',')})`)
      .split('\n').filter(Boolean);
  }
  const clist = carIds.map((c) => `'${c}'`).join(',');
  // payment rows hang off bookings — remove them before the bookings go.
  // CRITICAL: this SELECT must stay scoped to the test entities. With an empty
  // uid/car scope it would match EVERY booking and wipe baseline refunds,
  // transactions, invoices and reviews belonging to pre-existing demo data.
  if (uids.length || clist) {
    const ulist = uids.map((i) => `'${i}'`).join(',');
    const bookings = sql(
      `SELECT id FROM booking.bookings WHERE ` +
        [ulist ? `renter_id IN (${ulist}) OR owner_id IN (${ulist})` : null, clist ? `id IN (${clist})` : null]
          .filter(Boolean).join(' OR ') || `id = '__none__'`,
    ).split('\n').filter(Boolean);
    if (bookings.length) {
      const blist = bookings.map((b) => `'${b}'`).join(',');
      // audit rows reference the booking ids — pull them before the bookings go
      sql(`DELETE FROM booking.audit_logs WHERE entity_id IN (${blist})`);
      for (const t of ['payment.transactions', 'payment.invoices', 'payment.refunds']) {
        sql(`DELETE FROM ${t} WHERE booking_id IN (${blist})`);
      }
      sql(`DELETE FROM booking.trip_extensions WHERE booking_id IN (${blist})`);
      sql(`DELETE FROM booking.disputes WHERE booking_id IN (${blist})`);
      sql(`DELETE FROM booking.reviews WHERE booking_id IN (${blist})`);
      sql(`DELETE FROM booking.cancellations WHERE booking_id IN (${blist})`);
    }
  }
  if (uids.length) {
    const list = uids.map((i) => `'${i}'`).join(',');
    for (const [table, col] of USER_TABLES) sql(`DELETE FROM ${table} WHERE ${col} IN (${list})`);
    sql(`DELETE FROM booking.audit_logs WHERE actor_id IN (${list})`);
    sql(`DELETE FROM auth.users WHERE id IN (${list})`);
  }
  if (clist) {
    for (const [table, col] of CAR_TABLES) sql(`DELETE FROM ${table} WHERE ${col} IN (${clist})`);
    sql(`DELETE FROM booking.reviews WHERE target_user_id IN (${clist})`);
  }
  sql(`DELETE FROM notification.sms_logs WHERE to_phone IN ('${OWNER_PHONE}','${RENTER_PHONE}')`);
  sql(`DELETE FROM auth.otp_verifications WHERE created_at >= '${RUN_STARTED_AT}'`);
  sql(`DELETE FROM auth.sessions WHERE created_at >= '${RUN_STARTED_AT}'`);
}

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean, extra?: unknown) => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else {
    fails.push(label);
    console.log(`  FAIL ${label}${extra === undefined ? '' : '  ' + JSON.stringify(extra)}`);
  }
};

interface CallOpts { method?: string; token?: string; body?: unknown; }
async function call(route: string, opts: CallOpts = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(BASE + route, { method: opts.method ?? 'GET', headers, body });
  let json: any = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
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

/** Signup → phone verify → SQL KYC approve → re-login (token carries kyc). */
async function makeAccount(name: string, email: string, phone: string, password: string, role: string) {
  const signup = await call('/auth/signup', {
    method: 'POST',
    body: { name, email, phone, password, role },
  });
  const otp = signup.json?.dev_otp;
  const login = await call('/auth/login', { method: 'POST', body: { email, password } });
  const token0 = login.json?.access_token ?? login.json?.token;
  if (otp && token0) {
    await call('/auth/otp/phone/verify', { method: 'POST', token: token0, body: { code: String(otp) } });
  }
  sql(`UPDATE auth.users SET kyc_status='approved' WHERE email='${email}'`);
  const login2 = await call('/auth/login', { method: 'POST', body: { email, password } });
  const token = login2.json?.access_token ?? login2.json?.token;
  return { token, kyc: login2.json?.user?.kyc_status };
}

function day(offset: number): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  cleanup(); // idempotent — a previous crashed run must not poison this one

  // ---- accounts -----------------------------------------------------------
  const owner = await makeAccount('Reviews E2E Owner', OWNER_EMAIL, OWNER_PHONE, OWNER_PASSWORD, 'car_owner');
  ok('owner account ready (kyc approved)', Boolean(owner.token) && owner.kyc === 'approved', owner);
  const renter = await makeAccount('Reviews E2E Renter', RENTER_EMAIL, RENTER_PHONE, RENTER_PASSWORD, 'car_renter');
  ok('renter account ready (kyc approved)', Boolean(renter.token) && renter.kyc === 'approved', renter);
  if (!owner.token || !renter.token) throw new Error('accounts unavailable — cannot continue');

  // ---- car live on the marketplace ---------------------------------------
  const created = await call('/cars', {
    method: 'POST', token: owner.token,
    body: {
      make: 'Hyundai', model: 'Creta', year: 2023, plate_number: PLATE,
      category: 'suv', transmission: 'automatic', fuel_type: 'petrol', seats: 5,
    },
  });
  const carId = created.json?.id;
  ok('car created', Boolean(carId), created.json);
  if (!carId) throw new Error('no car id — cannot continue');
  await call(`/cars/${carId}/pricing`, {
    method: 'PUT', token: owner.token,
    body: { daily_rate_paise: 250000, weekly_rate_paise: 1500000, security_deposit_paise: 400000 },
  });
  sql(`UPDATE fleet.cars SET status='pending_review' WHERE id='${carId}'`);

  const adminTok = await adminToken();
  ok('admin 2FA token', Boolean(adminTok));
  if (!adminTok) throw new Error('admin token unavailable — cannot approve the car');
  const decided = await call(`/admin/cars/${carId}/decide`, {
    method: 'POST', token: adminTok, body: { decision: 'approve' },
  });
  ok('admin approved the car', decided.status === 200, decided.json);

  // ---- car rating fields are visible while browsing (before any review) ---
  const search0 = await call('/cars/search');
  const car0 = (search0.json ?? []).find((c: any) => c.id === carId);
  ok('search carries avg_rating/total_reviews', car0 && typeof car0.avg_rating === 'number' && typeof car0.total_reviews === 'number', car0);
  ok('  starts unrated', car0?.avg_rating === 0 && car0?.total_reviews === 0, car0);

  // ---- reviews are impossible before the trip completes -------------------
  const tooEarly = await call('/reviews', {
    method: 'POST', token: renter.token, body: { booking_id: '00000000-0000-4000-8000-000000000000', rating: 5 },
  });
  ok('review blocked for a non-existent/non-completed booking', tooEarly.status >= 400, tooEarly.status);

  // ---- trip 1: request → approve → start → complete ------------------------
  const bk1 = await call('/bookings', {
    method: 'POST', token: renter.token,
    body: { car_id: carId, start_date: day(10), end_date: day(13) },
  });
  const booking1 = bk1.json?.id;
  ok('renter booking created', bk1.status === 201 || bk1.status === 200, bk1.json);
  if (!booking1) throw new Error('no booking id — cannot continue');

  // the owner sees the incoming request WITH the renter's identity + rating
  const reqs = await call('/bookings/requests', { token: owner.token });
  const reqRow = (reqs.json ?? []).find((r: any) => r.id === booking1);
  ok('owner sees the incoming request', Boolean(reqRow), reqs.json?.map?.((r: any) => r.id));
  ok('  request carries the renter profile', reqRow?.renter?.name === 'Reviews E2E Renter', reqRow?.renter);
  ok('  renter rating present (0 reviews initially)', reqRow?.renter?.avg_rating === 0 && reqRow?.renter?.total_reviews === 0, reqRow?.renter);
  ok('  renter comments list present', Array.isArray(reqRow?.renter?.recent_comments) && reqRow.renter.recent_comments.length === 0, reqRow?.renter);

  await call(`/bookings/${booking1}/decide`, { method: 'POST', token: owner.token, body: { decision: 'approve' } });
  await call(`/bookings/${booking1}/start-trip`, { method: 'POST', token: owner.token });
  const done1 = await call(`/bookings/${booking1}/complete`, { method: 'POST', token: owner.token });
  ok('trip completed', done1.status === 200, done1.json);

  // ---- owner rates the renter (mutual review, side 1) ----------------------
  const ownerReview = await call('/reviews/renter', {
    method: 'POST', token: owner.token,
    body: { booking_id: booking1, rating: 5, comment: 'Prompt pickup, drove carefully, no issues.' },
  });
  ok('POST /reviews/renter (owner rates renter)', ownerReview.status === 200 || ownerReview.status === 201, ownerReview.json);
  ok('  targets only the renter', JSON.stringify(ownerReview.json?.targets) === '["renter"]', ownerReview.json);
  const ownerDup = await call('/reviews/renter', {
    method: 'POST', token: owner.token, body: { booking_id: booking1, rating: 1 },
  });
  ok('duplicate owner review rejected', ownerDup.status >= 400, ownerDup.status);

  // ---- renter rates car + owner in one submission (mutual, side 2) ---------
  const renterReview = await call('/reviews', {
    method: 'POST', token: renter.token,
    body: { booking_id: booking1, rating: 4, comment: 'Clean car, owner was cooperative throughout.' },
  });
  ok('POST /reviews (renter rates car + owner)', renterReview.status === 200 || renterReview.status === 201, renterReview.json);
  ok('  targets car AND owner', JSON.stringify(renterReview.json?.targets) === '["car","owner"]', renterReview.json);
  const renterDup = await call('/reviews', {
    method: 'POST', token: renter.token, body: { booking_id: booking1, rating: 1 },
  });
  ok('duplicate renter review rejected', renterDup.status >= 400, renterDup.status);

  // ---- the car's rating is live for future renters ------------------------
  const rv = await call(`/cars/${carId}/reviews`);
  ok('GET /cars/:id/reviews', rv.status === 200, rv.status);
  ok('  one review counted', rv.json?.total_reviews === 1, rv.json);
  ok('  average is 4.0', rv.json?.avg_rating === 4, rv.json);
  ok('  reviewer name + comment present', rv.json?.reviews?.[0]?.reviewer_name === 'Reviews E2E Renter' && Boolean(rv.json?.reviews?.[0]?.comment), rv.json?.reviews);
  ok('  owner review did NOT pollute the car rating', !(rv.json?.reviews ?? []).some((r: any) => r.comment === 'Prompt pickup, drove carefully, no issues.'), rv.json?.reviews);

  const search1 = await call('/cars/search');
  const car1 = (search1.json ?? []).find((c: any) => c.id === carId);
  ok('search shows the car rating while booking', car1?.avg_rating === 4 && car1?.total_reviews === 1, car1);

  // ---- trip 2: the NEXT incoming request shows that rating + comments -----
  const bk2 = await call('/bookings', {
    method: 'POST', token: renter.token,
    body: { car_id: carId, start_date: day(20), end_date: day(23) },
  });
  const booking2 = bk2.json?.id;
  ok('second booking created', Boolean(booking2), bk2.json);

  const reqs2 = await call('/bookings/requests', { token: owner.token });
  const req2 = (reqs2.json ?? []).find((r: any) => r.id === booking2);
  ok('new request carries the renter rating (5.0)', req2?.renter?.avg_rating === 5 && req2?.renter?.total_reviews === 1, req2?.renter);
  ok('  and the owner\u2019s comment for that renter', req2?.renter?.recent_comments?.[0]?.comment === 'Prompt pickup, drove carefully, no issues.', req2?.renter?.recent_comments);
  ok('  with the reviewing owner\u2019s name', req2?.renter?.recent_comments?.[0]?.reviewer_name === 'Reviews E2E Owner', req2?.renter?.recent_comments);

  // ---- has_reviewed flags stay correct ------------------------------------
  const mine = await call('/bookings/my', { token: renter.token });
  const row = (mine.json ?? []).find((b: any) => b.id === booking1);
  ok('renter has_reviewed set', row?.has_reviewed === true, row?.has_reviewed);
  const comp = await call('/bookings/completed', { token: owner.token });
  const crow = (comp.json ?? []).find((b: any) => b.id === booking1);
  ok('owner has_reviewed set', crow?.has_reviewed === true, crow?.has_reviewed);

  cleanup();

  const now = {
    users: sql(`SELECT COUNT(*) FROM auth.users`),
    bookings: sql(`SELECT COUNT(*) FROM booking.bookings`),
    refunds: sql(`SELECT COUNT(*) FROM payment.refunds`),
  };
  ok('baseline users restored', now.users === baseline.users, { before: baseline.users, after: now.users });
  ok('baseline bookings restored', now.bookings === baseline.bookings, { before: baseline.bookings, after: now.bookings });
  ok('baseline refunds restored', now.refunds === baseline.refunds, { before: baseline.refunds, after: now.refunds });
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
    console.log('Failed assertions:');
    for (const f of fails) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

void run();
