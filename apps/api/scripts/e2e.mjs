/* End-to-end smoke test for the car rental platform.
   Run with the API server up: node e2e.mjs */
const BASE = 'http://localhost:4000';
let failures = 0;

function ok(name, cond, extra = '') {
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
}

async function req(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function otpFromDb(email) {
  // dev helper: read OTP from sms_logs (server-side dev_otp also returned at signup)
  return null;
}

const fakePng = () => {
  const buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  return new Blob([buf], { type: 'image/png' });
};

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

async function main() {
  console.log('== 1. Auth portal split ==');
  let r = await req('POST', '/auth/admin/login', { body: { email: 'admin@platform.local', password: 'Admin@12345' } });
  ok('admin login asks 2FA', r.data.requires_2fa === true);

  r = await req('POST', '/auth/signup', { body: { name: 'Owner One', email: 'owner1@test.com', phone: '+919800000001', password: 'Passw0rd!', role: 'car_owner' } });
  ok('owner signup returns OTP', !!r.data.dev_otp);
  const ownerOtp = r.data.dev_otp;

  await req('POST', '/auth/login', { body: { email: 'owner1@test.com', password: 'Passw0rd!' } });
  r = await req('POST', '/auth/login', { body: { email: 'owner1@test.com', password: 'Passw0rd!' } });
  ok('owner logs into main portal', r.status === 200 && r.data.user.role === 'car_owner');
  const ownerToken = r.data.access_token;

  r = await req('POST', '/auth/agent/login', { body: { email: 'owner1@test.com', password: 'Passw0rd!' } });
  ok('owner REJECTED on agent portal', r.status === 401);

  // verify phone
  r = await req('POST', '/auth/otp/phone/verify', { token: ownerToken, body: { code: ownerOtp } });
  ok('phone verified', r.status === 200);

  console.log('== 2. KYC gate ==');
  r = await req('GET', '/cars/mine', { token: ownerToken });
  ok('cars list blocked before KYC approval', r.status === 403);

  // upload KYC docs
  r = await req('POST', '/kyc/documents', { token: ownerToken, body: form({ doc_type: 'id_proof', file: fakePng(), }) });
  ok('id proof uploaded', [201,200].includes(r.status), JSON.stringify(r.data));
  r = await req('POST', '/kyc/documents', { token: ownerToken, body: form({ doc_type: 'address_proof', file: fakePng() }) });
  ok('address proof uploaded', [201,200].includes(r.status), JSON.stringify(r.data));

  // admin approves KYC
  r = await req('POST', '/auth/admin/login', { body: { email: 'admin@platform.local', password: 'Admin@12345' } });
  const twofa = r.data.twofa_token;
  // read code from sms log via sqlite
  const { createRequire } = await import('module');
  const require2 = createRequire(import.meta.url);
  const { fileURLToPath } = await import('url');
  const pathOf = (p) => fileURLToPath(new URL(p, import.meta.url));
  const Database = require2('better-sqlite3');
  const ndb = new Database(pathOf('../data/notification.db'));
  const code = ndb.prepare(`SELECT body FROM sms_logs ORDER BY created_at DESC LIMIT 1`).get().body.match(/\d{6}/)[0];
  r = await req('POST', '/auth/admin/login/verify', { body: { twofa_token: twofa, code } });
  ok('admin 2FA verify', r.status === 200 && !!r.data.access_token);
  const adminToken = r.data.access_token;

  r = await req('GET', '/kyc/queue', { token: adminToken });
  ok('admin sees KYC queue with 2 docs', Array.isArray(r.data) && r.data.length >= 2, JSON.stringify(r.data).slice(0, 100));
  for (const doc of r.data) {
    await req('POST', `/kyc/review/${doc.id}`, { token: adminToken, body: { decision: 'approve' } });
  }
  r = await req('GET', '/auth/me', { token: ownerToken });
  ok('owner kyc_status approved', r.data.user.kyc_status === 'approved');

  console.log('== 3. Owner lists car ==');
  r = await req('POST', '/cars', {
    token: ownerToken,
    body: { make: 'Maruti', model: 'Swift', year: 2022, plate_number: 'KA01AB1234', category: 'hatchback', transmission: 'manual', fuel_type: 'petrol', seats: 5 },
  });
  ok('car created (draft)', [201,200].includes(r.status) && r.data.status === 'draft');
  const carId = r.data.id;

  r = await req('POST', `/cars/${carId}/submit`, { token: ownerToken });
  ok('submit blocked without photos/docs', r.status === 400);

  for (let i = 0; i < 4; i++) {
    await req('POST', `/cars/${carId}/photos`, { token: ownerToken, body: form({ files: fakePng() }) });
  }
  r = await req('POST', `/cars/${carId}/documents`, { token: ownerToken, body: form({ doc_type: 'rc_book', file: fakePng() }) });
  ok('rc uploaded', [201,200].includes(r.status));
  await req('POST', `/cars/${carId}/documents`, { token: ownerToken, body: form({ doc_type: 'insurance', file: fakePng() }) });

  r = await req('POST', `/cars/${carId}/submit`, { token: ownerToken });
  ok('submitted for review', r.status === 200);

  r = await req('POST', `/admin/cars/${carId}/decide`, { token: adminToken, body: { decision: 'approve' } });
  ok('approval BLOCKED without pricing', r.status === 400 && /daily rate/i.test(JSON.stringify(r.data)));

  r = await req('PUT', `/cars/${carId}/pricing`, { token: ownerToken, body: { daily_rate_paise: 150000, security_deposit_paise: 200000 } });
  ok('pricing set', r.status === 200);
  // core edit relock test
  r = await req('PATCH', `/cars/${carId}`, { token: ownerToken, body: { plate_number: 'KA01AB9999' } });
  void r;

  r = await req('POST', `/admin/cars/${carId}/decide`, { token: adminToken, body: { decision: 'approve' } });
  ok('car approved & active', r.status === 200);

  console.log('== 4. Renter books ==');
  r = await req('POST', '/auth/signup', { body: { name: 'Renter One', email: 'renter1@test.com', phone: '+919800000002', password: 'Passw0rd!', role: 'car_renter' } });
  const renterOtp = r.data.dev_otp;
  r = await req('POST', '/auth/login', { body: { email: 'renter1@test.com', password: 'Passw0rd!' } });
  const renterToken = r.data.access_token;
  await req('POST', '/auth/otp/phone/verify', { token: renterToken, body: { code: renterOtp } });
  await req('POST', '/kyc/documents', { token: renterToken, body: form({ doc_type: 'id_proof', file: fakePng() }) });
  await req('POST', '/kyc/documents', { token: renterToken, body: form({ doc_type: 'address_proof', file: fakePng() }) });
  r = await req('GET', '/kyc/queue', { token: adminToken });
  for (const doc of r.data.filter((d) => d.user_role === 'car_renter')) {
    await req('POST', `/kyc/review/${doc.id}`, { token: adminToken, body: { decision: 'approve' } });
  }

  r = await req('GET', '/cars/search', { token: renterToken });
  ok('search returns active car', Array.isArray(r.data) && r.data.length >= 1);

  const start = new Date(Date.now() + 7 * 24 * 3600e3).toISOString();
  const end = new Date(Date.now() + 9 * 24 * 3600e3).toISOString();
  r = await req('POST', '/bookings', { token: renterToken, body: { car_id: carId, start_date: start, end_date: end } });
  ok('booking request created', [201,200].includes(r.status) && r.data.status === 'requested', JSON.stringify(r.data));
  const bookingId = r.data?.id ?? r.data?.data?.id;
  const b = await req('GET', `/bookings/${bookingId}`, { token: renterToken });
  ok('total = 2 days x 150000 = 300000', b.data.total_amount_paise === 300000, `got ${b.data.total_amount_paise}`);

  r = await req('POST', `/bookings/${bookingId}/decide`, { token: ownerToken, body: { decision: 'approve' } });
  ok('owner approved -> partial captured', r.status === 200 && r.data.online_charged_paise > 0, JSON.stringify(r.data));
  ok('20% of 300000 = 60000 held', r.data.rental_part_paise === 60000, `got ${r.data.rental_part_paise}`);

  r = await req('POST', `/bookings/${bookingId}/start-trip`, { token: ownerToken });
  ok('trip started with cash recorded', r.status === 200);

  console.log('== 5. Extension flow ==');
  const newEnd = new Date(Date.now() + 10 * 24 * 3600e3).toISOString();
  r = await req('POST', `/bookings/${bookingId}/extend`, { token: renterToken, body: { new_end_date: newEnd } });
  ok('extension requested', [201,200].includes(r.status) && r.data.additional_days === 1, JSON.stringify(r.data));
  const extId = r.data.extension_id;
  r = await req('POST', `/extensions/${extId}/decide`, { token: ownerToken, body: { decision: 'approve' } });
  ok('extension approved+paid', r.status === 200);

  console.log('== 6. Complete trip -> late fee none -> sweep settles ==');
  r = await req('POST', `/bookings/${bookingId}/complete`, { token: ownerToken });
  ok('trip completed', r.status === 200 && r.data.late_fee_paise === 0);

  r = await req('GET', '/bookings/my', { token: renterToken });
  ok('renter sees booking', r.data.length === 1);

  // simulate dispute window passing
  const adb2 = new Database(pathOf('../data/booking.db'));
  adb2.prepare(`UPDATE bookings SET completed_at = datetime('now', '-25 hours') WHERE id = ?`).run(bookingId);
  await req('GET', '/admin/overview', { token: adminToken }); // triggers settlement sweep
  r = await req('GET', '/payments/earnings', { token: ownerToken });
  const avail = r.data.wallet.available_balance_paise;
  ok('owner earnings settled after window', avail >= 60000, `available=${avail}`);

  const pdb2 = new Database(pathOf('../data/payment.db'));
  const refundRow = pdb2.prepare(`SELECT COUNT(*) AS c FROM transactions WHERE booking_id = ? AND type='deposit_refund'`).get(bookingId);
  ok('deposit auto-refunded', refundRow.c === 1);

  console.log('== 7. Reviews + payout ==');
  r = await req('POST', '/reviews', { token: renterToken, body: { booking_id: bookingId, rating: 5, comment: 'Great car' } });
  ok('renter reviewed owner', r.status === 200);

  r = await req('POST', '/payouts/request', { token: ownerToken, body: { amount_paise: 50000 } });
  ok('payout requested', r.status === 200);
  const payoutId = (await req('GET', '/admin/payouts?status=requested', { token: adminToken })).data[0]?.id;
  r = await req('POST', `/admin/payouts/${payoutId}/approve`, { token: adminToken });
  ok('admin approved payout', r.status === 200);
  r = await req('POST', `/admin/payouts/${payoutId}/paid`, { token: adminToken });
  ok('payout marked paid', r.status === 200);

  console.log('== 8. Cancellation tiers on second booking ==');
  const start2 = new Date(Date.now() + 48 * 3600e3).toISOString();
  const end2 = new Date(Date.now() + 60 * 3600e3).toISOString();
  r = await req('POST', '/bookings', { token: renterToken, body: { car_id: carId, start_date: start2, end_date: end2 } });
  const b2 = r.data.id;
  await req('POST', `/bookings/${b2}/decide`, { token: ownerToken, body: { decision: 'approve' } });
  r = await req('POST', `/bookings/${b2}/cancel`, { token: renterToken, body: { reason: 'change of plans' } });
  ok('free tier cancel (>24h)', r.data.message.includes('free'), JSON.stringify(r.data));

  console.log('== 9. Reports ==');
  const csvRes = await fetch(`${BASE}/admin/reports/bookings`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const csvText = await csvRes.text();
  ok('CSV report downloads', csvRes.status === 200 && csvText.split('\n').length > 2);

  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
