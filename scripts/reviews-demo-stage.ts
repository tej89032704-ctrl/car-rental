/**
 * Stages (and with --cleanup, removes) a tiny demo so the owner Requests page
 * can be viewed in the browser with a real incoming booking request that shows
 * the requesting renter's rating + comments.
 *
 *   npx tsx scripts/reviews-demo-stage.ts            # stage
 *   npx tsx scripts/reviews-demo-stage.ts --cleanup  # remove + verify baseline
 *
 * Strictly scoped: every DELETE is guarded by a non-empty demo id list.
 * Requires API on :4000, psql, CR_LOCAL_PG_PASSWORD (or PGPASSWORD).
 */
import { execFileSync } from 'node:child_process';

const BASE = 'http://localhost:4000';
const PSQL = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const OWNER_EMAIL = 'reviews-demo-owner@test.local';
const OWNER_PHONE = '+919000000013';
const RENTER_EMAIL = 'reviews-demo-renter@test.local';
const RENTER_PHONE = '+919000000014';
const PASSWORD = 'ReviewsDemo@12345';
const PLATE = 'UP32DM7788';

function pgPassword(): string {
  const p = process.env.PGPASSWORD || process.env.CR_LOCAL_PG_PASSWORD || '';
  if (!p) throw new Error('Set CR_LOCAL_PG_PASSWORD (or PGPASSWORD) to run this script.');
  return p;
}
function sql(query: string): string {
  return execFileSync(PSQL, ['-U', 'postgres', '-h', '127.0.0.1', '-d', 'cr_dev', '-t', '-A', '-c', query],
    { env: { ...process.env, PGPASSWORD: pgPassword() }, encoding: 'utf8' }).replace(/\r/g, '').trim();
}
async function call(route: string, opts: { method?: string; token?: string; body?: any } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await fetch(BASE + route, { method: opts.method ?? 'GET', headers, body });
  let json: any = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}
async function adminToken(): Promise<string | undefined> {
  const since = new Date().toISOString();
  const login = await call('/auth/admin/login', { method: 'POST', body: { email: 'admin@platform.local', password: 'Admin@12345' } });
  const twofa = login.json?.twofa_token;
  if (!twofa) return undefined;
  const code = sql(`SELECT body FROM notification.sms_logs WHERE body LIKE '%admin login verification code%' AND created_at >= '${since}' ORDER BY created_at DESC LIMIT 1`)
    .match(/code is (\d+)/)?.[1];
  if (!code) return undefined;
  const v = await call('/auth/admin/login/verify', { method: 'POST', body: { twofa_token: twofa, code } });
  return v.json?.token ?? v.json?.access_token;
}
async function makeAccount(email: string, phone: string, name: string, role: string): Promise<string> {
  const signup = await call('/auth/signup', { method: 'POST', body: { name, email, phone, password: PASSWORD, role } });
  const otp = signup.json?.dev_otp;
  const login = await call('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  const t0 = login.json?.access_token ?? login.json?.token;
  if (otp && t0) await call('/auth/otp/phone/verify', { method: 'POST', token: t0, body: { code: String(otp) } });
  sql(`UPDATE auth.users SET kyc_status='approved' WHERE email='${email}'`);
  const login2 = await call('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  const token = login2.json?.access_token ?? login2.json?.token;
  if (!token) throw new Error(`no token for ${email}`);
  return token;
}
function day(offset: number): string {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}
function idList(ids: string[]): string { return ids.map((i) => `'${i}'`).join(','); }

function cleanup(): void {
  const uids = sql(`SELECT id FROM auth.users WHERE email IN ('${OWNER_EMAIL}','${RENTER_EMAIL}')`).split('\n').filter(Boolean);
  if (!uids.length) { console.log('nothing to clean'); return; }
  const ulist = idList(uids);
  const carIds = sql(`SELECT id FROM fleet.cars WHERE plate_number='${PLATE}' OR owner_id IN (${ulist})`).split('\n').filter(Boolean);
  const clist = idList(carIds);
  const bookings = sql(`SELECT id FROM booking.bookings WHERE renter_id IN (${ulist}) OR owner_id IN (${ulist})`).split('\n').filter(Boolean);
  if (bookings.length) {
    const blist = idList(bookings);
    sql(`DELETE FROM booking.audit_logs WHERE entity_id IN (${blist})`);
    for (const t of ['payment.transactions', 'payment.invoices', 'payment.refunds']) sql(`DELETE FROM ${t} WHERE booking_id IN (${blist})`);
    sql(`DELETE FROM booking.trip_extensions WHERE booking_id IN (${blist})`);
    sql(`DELETE FROM booking.disputes WHERE booking_id IN (${blist})`);
    sql(`DELETE FROM booking.reviews WHERE booking_id IN (${blist})`);
    sql(`DELETE FROM booking.cancellations WHERE booking_id IN (${blist})`);
  }
  sql(`DELETE FROM booking.audit_logs WHERE actor_id IN (${ulist})`);
  for (const [t, c] of [
    ['auth.otp_verifications', 'user_id'], ['auth.sessions', 'user_id'], ['auth.kyc_documents', 'user_id'],
    ['auth.role_change_requests', 'user_id'], ['auth.audit_logs', 'created_by'],
    ['booking.bookings', 'renter_id'], ['booking.bookings', 'owner_id'],
    ['booking.reviews', 'reviewer_id'], ['booking.reviews', 'target_user_id'], ['booking.reviews', 'created_by'],
    ['booking.disputes', 'raised_by'], ['booking.disputes', 'against_user_id'],
    ['payment.wallets', 'user_id'], ['payment.subscriptions', 'user_id'], ['payment.audit_logs', 'created_by'],
    ['notification.notifications', 'user_id'], ['notification.push_tokens', 'user_id'], ['notification.sms_logs', 'created_by'],
    ['fleet.audit_logs', 'created_by'],
  ] as [string, string][]) sql(`DELETE FROM ${t} WHERE ${c} IN (${ulist})`);
  if (clist) {
    for (const [t, c] of [
      ['fleet.cars', 'id'], ['fleet.car_photos', 'car_id'], ['fleet.car_documents', 'car_id'],
      ['fleet.car_pricing', 'car_id'], ['fleet.car_availability', 'car_id'], ['fleet.car_verifications', 'car_id'],
      ['fleet.audit_logs', 'entity_id'], ['booking.car_cache', 'id'],
    ] as [string, string][]) sql(`DELETE FROM ${t} WHERE ${c} IN (${clist})`);
    sql(`DELETE FROM booking.reviews WHERE target_user_id IN (${clist})`);
  }
  sql(`DELETE FROM notification.sms_logs WHERE to_phone IN ('${OWNER_PHONE}','${RENTER_PHONE}')`);
  sql(`DELETE FROM auth.users WHERE id IN (${ulist})`);
  console.log('demo cleaned');
}

async function stage(): Promise<void> {
  cleanup();
  const ownerTok = await makeAccount(OWNER_EMAIL, OWNER_PHONE, 'Demo Owner Ravi', 'car_owner');
  const renterTok = await makeAccount(RENTER_EMAIL, RENTER_PHONE, 'Demo Renter Priya', 'car_renter');

  const created = await call('/cars', {
    method: 'POST', token: ownerTok,
    body: { make: 'Hyundai', model: 'Creta', year: 2023, plate_number: PLATE, category: 'suv', transmission: 'automatic', fuel_type: 'petrol', seats: 5 },
  });
  const carId = created.json?.id;
  if (!carId) throw new Error('car create failed: ' + JSON.stringify(created.json));
  await call(`/cars/${carId}/pricing`, { method: 'PUT', token: ownerTok, body: { daily_rate_paise: 260000, weekly_rate_paise: 1600000, security_deposit_paise: 200000 } });
  sql(`UPDATE fleet.cars SET status='pending_review' WHERE id='${carId}'`);
  const adm = await adminToken();
  if (!adm) throw new Error('admin token failed');
  await call(`/admin/cars/${carId}/decide`, { method: 'POST', token: adm, body: { decision: 'approve' } });

  const bk = await call('/bookings', { method: 'POST', token: renterTok, body: { car_id: carId, start_date: day(12), end_date: day(15) } });
  const bookingId = bk.json?.id;
  if (!bookingId) throw new Error('booking failed: ' + JSON.stringify(bk.json));

  // Seed the renter's review history (owners' ratings of this renter) so the
  // incoming request card shows a real average + comments.
  const ownerId = sql(`SELECT id FROM auth.users WHERE email='${OWNER_EMAIL}'`);
  const renterId = sql(`SELECT id FROM auth.users WHERE email='${RENTER_EMAIL}'`);
  sql(`INSERT INTO booking.reviews (id, booking_id, reviewer_id, target_type, target_user_id, rating, comment, is_deleted, created_at, updated_at, created_by)
    VALUES
    ('d3m0r3v1-0000-4000-8000-000000000001','${bookingId}','${ownerId}','renter','${renterId}',5,'Returned the car spotless and on time. Would rent to her again.',0,'2026-09-20T10:00:00.000Z','2026-09-20T10:00:00.000Z','${ownerId}'),
    ('d3m0r3v2-0000-4000-8000-000000000002','${bookingId}','${ownerId}','renter','${renterId}',4,'Clear communication throughout the trip, no issues at handover.',0,'2026-09-24T10:00:00.000Z','2026-09-24T10:00:00.000Z','${ownerId}')
    ON CONFLICT (id) DO NOTHING`);

  console.log(JSON.stringify({ owner: OWNER_EMAIL, renter: RENTER_EMAIL, password: PASSWORD, carId, bookingId }, null, 2));
}

async function run(): Promise<void> {
  if (process.argv.includes('--cleanup')) {
    cleanup();
    console.log(sql(`SELECT 'users ' || COUNT(*) FROM auth.users UNION ALL SELECT 'bookings ' || COUNT(*) FROM booking.bookings UNION ALL SELECT 'cars ' || COUNT(*) FROM fleet.cars UNION ALL SELECT 'refunds ' || COUNT(*) FROM payment.refunds UNION ALL SELECT 'reviews ' || COUNT(*) FROM booking.reviews`).replace(/\n/g, ' | '));
    return;
  }
  await stage();
}
void run().catch((e) => { console.error(e); process.exitCode = 1; });
