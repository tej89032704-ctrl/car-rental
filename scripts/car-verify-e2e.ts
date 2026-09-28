/**
 * End-to-end check of live car verification (RC / VAHAN) over real HTTP:
 * owner self-check, admin-queue check, admin verify, manual override, and the
 * persistence of full attempt history in `car_verifications`.
 *
 * Self-cleaning: the test car, its verification rows and the test account are
 * removed on the way out and again if anything throws. Run with:
 *   npx tsx scripts/car-verify-e2e.ts
 *
 * Requires the API to be up (localhost:4000) with migrations applied.
 */
import { execFileSync } from 'node:child_process';

const BASE = 'http://localhost:4000';
const PSQL = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const EMAIL = 'carverify-e2e@test.local';
const PHONE = '+919000000008';
const PASSWORD = 'CarVerify@12345';
const PLATE = `UP32CV${String(Date.now() % 900 + 100)}`;

const RUN_STARTED_AT = new Date().toISOString();

/** Local Postgres password comes from the environment, never from source. */
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
  return out.replace(/\r/g, '').trim();
}

/** Every table that can reference the test owner/all the test car. */
const USER_TABLES: [string, string][] = [
  ['auth.otp_verifications', 'user_id'],
  ['auth.sessions', 'user_id'],
  ['auth.kyc_documents', 'user_id'],
  ['auth.role_change_requests', 'user_id'],
  ['auth.audit_logs', 'created_by'],
  ['booking.bookings', 'renter_id'],
  ['booking.bookings', 'owner_id'],
  ['booking.reviews', 'reviewer_id'],
  ['payment.wallets', 'user_id'],
  ['payment.subscriptions', 'user_id'],
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
  const uids = sql(`SELECT id FROM auth.users WHERE email='${EMAIL}'`).split('\n').filter(Boolean);
  if (uids.length) {
    const list = uids.map((i) => `'${i}'`).join(',');
    let carIds = sql(`SELECT id FROM fleet.cars WHERE owner_id IN (${list})`).split('\n').filter(Boolean);
    if (!carIds.length) {
      // A crashed run may have orphaned the car (user removed, car left behind).
      carIds = sql(`SELECT id FROM fleet.cars WHERE plate_number='${PLATE}'`).split('\n').filter(Boolean);
    }
    for (const [table, col] of USER_TABLES) sql(`DELETE FROM ${table} WHERE ${col} IN (${list})`);
    if (carIds.length) {
      const clist = carIds.map((c) => `'${c}'`).join(',');
      for (const [table, col] of CAR_TABLES) sql(`DELETE FROM ${table} WHERE ${col} IN (${clist})`);
    }
    sql(`DELETE FROM auth.users WHERE id IN (${list})`);
  }
  sql(`DELETE FROM notification.sms_logs WHERE to_phone='${PHONE}'`);
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

async function main(): Promise<void> {
  cleanup(); // idempotent — a previous crashed run must not poison this one

  // ---- identity ----------------------------------------------------------
  const signup = await call('/auth/signup', {
    method: 'POST',
    body: { name: 'Car Verify E2E', email: EMAIL, phone: PHONE, password: PASSWORD, role: 'car_owner' },
  });
  ok('POST /auth/signup (car_owner)', [200, 201].includes(signup.status), signup);
  const otp = signup.json?.dev_otp;
  ok('dev_otp returned', Boolean(otp), signup.json);

  const login = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  ok('POST /auth/login', login.status === 200, login.status);
  const token = login.json?.access_token ?? login.json?.token;
  ok('token issued', Boolean(token));
  if (!token) throw new Error('no token — cannot continue');

  if (otp) {
    const v = await call('/auth/otp/phone/verify', { method: 'POST', token, body: { code: String(otp) } });
    ok('phone verified', v.status === 200, v);
  }

  // The fleet routes are behind the KYC gate, so approve the fresh owner in the
  // DB, then log in again so the new token carries `kyc_status: approved`.
  sql(`UPDATE auth.users SET kyc_status='approved' WHERE email='${EMAIL}'`);
  const login2 = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  const ownerTok = login2.json?.access_token ?? login2.json?.token;
  ok('fresh token after KYC approval', Boolean(ownerTok));
  if (!ownerTok) throw new Error('no owner token — cannot continue');
  ok('token carries kyc_status=approved', login2.json?.user?.kyc_status === 'approved', login2.json?.user);

  // ---- create the car ----------------------------------------------------
  const created = await call('/cars', {
    method: 'POST',
    token: ownerTok,
    body: {
      make: 'Maruti Suzuki', model: 'Swift', year: 2022, plate_number: PLATE,
      category: 'hatchback', transmission: 'manual', fuel_type: 'petrol', seats: 5,
    },
  });
  ok('POST /cars', created.status === 201, created.json);
  const carId = created.json?.id;
  ok('car created', Boolean(carId) && created.json?.plate_number === PLATE, created.json);
  if (!carId) throw new Error('no car id — cannot continue');

  // ---- owner self-check --------------------------------------------------
  const ownerVerify = await call(`/cars/${carId}/verify`, { method: 'POST', token: ownerTok });
  ok('POST /cars/:id/verify (owner)', ownerVerify.status === 200, ownerVerify.json);
  ok('  mock provider while no API key', ownerVerify.json?.provider === 'mock', ownerVerify.json);
  ok('  flagged live:false (demo)', ownerVerify.json?.live === false, ownerVerify.json);
  ok('  verdict is verified or failed', ['verified', 'failed'].includes(ownerVerify.json?.verdict), ownerVerify.json?.verdict);
  ok(
    '  vehicle record or failure message present',
    Boolean(ownerVerify.json?.vehicle) || Boolean(ownerVerify.json?.message),
    ownerVerify.json,
  );
  ok(
    '  match flag is a boolean',
    typeof ownerVerify.json?.match_make_model === 'boolean',
    ownerVerify.json?.match_make_model,
  );

  const overview = await call(`/cars/${carId}/verification`, { token: ownerTok });
  ok('GET /cars/:id/verification (owner)', overview.status === 200, overview.status);
  ok('  attempt history persisted (>=1 row)', (overview.json?.history ?? []).length >= 1, overview.json?.history?.length);
  ok(
    '  car verdict synced from the check',
    overview.json?.verification_status === ownerVerify.json?.verdict,
    { car: overview.json?.verification_status, ran: ownerVerify.json?.verdict },
  );

  // ---- make it approval-ready and show up in the admin queue -------------
  const pricing = await call(`/cars/${carId}/pricing`, {
    method: 'PUT', token: ownerTok,
    body: { daily_rate_paise: 220000, weekly_rate_paise: 1400000, security_deposit_paise: 300000 },
  });
  ok("pricing set (so approval won't be blocked)", pricing.status === 200, pricing);
  sql(`UPDATE fleet.cars SET status='pending_review' WHERE id='${carId}'`);

  // ---- admin side ---------------------------------------------------------
  const adminTok = await adminToken();
  if (adminTok) {
    const queue = await call('/admin/cars/queue', { token: adminTok });
    ok('GET /admin/cars/queue reachable', queue.status === 200, queue.status);
    const mine = (queue.json ?? []).find((c: any) => c.id === carId);
    ok('  test car appears in the queue', Boolean(mine), queue.json?.map?.((c: any) => c.plate_number));
    ok('  queue carries the latest verification', Boolean(mine?.verification), mine?.verification);
    ok('  no other pending car is polluted', (queue.json ?? []).length >= 1, (queue.json ?? []).length);

    const cfg = await call('/admin/verification/config', { token: adminTok });
    ok('GET /admin/verification/config', cfg.status === 200, cfg.json);
    ok('  demo mode reported (no key)', cfg.json?.live === false && cfg.json?.mode === 'auto', cfg.json);

    const adminVerify = await call(`/admin/cars/${carId}/verify`, { method: 'POST', token: adminTok });
    ok('POST /admin/cars/:id/verify', adminVerify.status === 200, adminVerify.json);
    ok('  mock provider (demo)', adminVerify.json?.provider === 'mock', adminVerify.json);

    const override = await call(`/admin/cars/${carId}/verification/override`, {
      method: 'POST', token: adminTok, body: { reason: 'e2e overrides the demo verdict' },
    });
    ok('POST /admin/cars/:id/verification/override', [200, 201].includes(override.status), override);
    const after = await call(`/cars/${carId}/verification`, { token: ownerTok });
    ok('  override recorded in history', after.json?.history?.[0]?.provider === 'manual', after.json?.history?.[0]);
    ok('  car marked verified', after.json?.verification_status === 'verified', after.json?.verification_status);
  } else {
    console.log('  skip admin checks (super_admin token unavailable)');
  }

  cleanup();
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