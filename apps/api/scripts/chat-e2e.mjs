/**
 * End-to-end check of the customer ⇄ owner booking chat over real HTTP.
 *
 *   node apps/api/scripts/chat-e2e.mjs      (API must be up on :4000)
 *
 * Covers what the mocked unit check cannot: the rows really persist in
 * `booking.booking_messages`, both participants read the same ordered thread,
 * and nobody else can read or write it.
 *
 * Self-cleaning: every fixture it creates (users, car, booking, messages) is
 * removed on the way out and again if anything throws. It writes only to a
 * local database, and refuses to run anywhere else.
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getDb, closeAll } = require('../dist/common/db/database.js');
const bcrypt = require('bcryptjs');

const target = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('Chat regression requires a local database');
}
const base = process.env.CHAT_TEST_API || 'http://127.0.0.1:4000';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('Chat regression requires a local API');
}

let checks = 0;
let failed = 0;
function check(name, cond, extra = '') {
  checks += 1;
  if (cond) console.log(`  PASS ${name}`);
  else { failed += 1; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
}

const auth = getDb('auth');
const fleet = getDb('fleet');
const bookingDb = getDb('booking');
const stamp = Date.now();
const password = `Chat${stamp}!aA`;

async function request(method, route, token, body) {
  const res = await fetch(base + route, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function makeUser(role, suffix) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const email = `chat_${stamp}_${suffix}@test.local`;
  await auth.prepare(
    `INSERT INTO users (id,name,email,phone,password_hash,role,status,kyc_status,created_at,updated_at,created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'active', 'approved', ?, ?, ?)`,
  ).run(id, `Chat ${suffix}`, email, `+9195${String(stamp).slice(-8)}${suffix.length}`, await bcrypt.hash(password, 10), role, now, now, id);
  return { id, email, role };
}

async function login(email) {
  const r = await request('POST', '/auth/login', null, { email, password });
  if (r.status !== 200 || !r.data?.access_token) {
    throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r.data.access_token;
}

const created = { users: [], cars: [], bookings: [] };

async function cleanup() {
  for (const id of created.bookings) {
    await bookingDb.prepare(`DELETE FROM booking_messages WHERE booking_id = ?`).run(id).catch(() => {});
    await bookingDb.prepare(`DELETE FROM booking_message_reads WHERE booking_id = ?`).run(id).catch(() => {});
    await bookingDb.prepare(`DELETE FROM bookings WHERE id = ?`).run(id).catch(() => {});
  }
  for (const id of created.cars) {
    await fleet.prepare(`DELETE FROM cars WHERE id = ?`).run(id).catch(() => {});
  }
  for (const id of created.users) {
    await auth.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id).catch(() => {});
    await auth.prepare(`DELETE FROM users WHERE id = ?`).run(id).catch(() => {});
  }
}

// Prices live in fleet.car_pricing, not on `cars`, and chat does not need one.
async function makeCar(ownerId) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const plate = `CH${String(stamp).slice(-6)}`;
  await fleet.prepare(
    `INSERT INTO cars (id,owner_id,make,model,year,plate_number,category,transmission,fuel_type,seats,
       status,is_deleted,created_at,updated_at,created_by)
     VALUES (?, ?, 'Chat', 'Fixture', 2020, ?, 'hatchback', 'manual', 'petrol', 5, 'active', 0, ?, ?, ?)`,
  ).run(id, ownerId, plate, now, now, ownerId);
  created.cars.push(id);
  return id;
}

async function makeBooking(ownerId, renterId, carId) {
  const id = randomUUID();
  const now = new Date().toISOString();
  await bookingDb.prepare(
    `INSERT INTO bookings (id,car_id,renter_id,owner_id,start_date,end_date,status,total_amount_paise,
       online_paid_paise,remaining_due_paise,security_deposit_paise,late_fee_paise,is_deleted,created_at,updated_at,created_by)
     VALUES (?, ?, ?, ?, '2026-12-01', '2026-12-03', 'confirmed', 300000, 60000, 240000, 0, 0, 0, ?, ?, ?)`,
  ).run(id, carId, renterId, ownerId, now, now, renterId);
  created.bookings.push(id);
  return id;
}

async function main() {
  console.log('== Booking chat ==');
  const owner = await makeUser('car_owner', 'owner');
  const renter = await makeUser('car_renter', 'renter');
  const strangerRenter = await makeUser('car_renter', 'stranger');
  const strangerOwner = await makeUser('car_owner', 'otherhost');
  created.users.push(owner.id, renter.id, strangerRenter.id, strangerOwner.id);

  const carId = await makeCar(owner.id);
  const bookingId = await makeBooking(owner.id, renter.id, carId);

  const renterToken = await login(renter.email);
  const ownerToken = await login(owner.email);
  const strangerRenterToken = await login(strangerRenter.email);
  const strangerOwnerToken = await login(strangerOwner.email);

  let r = await request('GET', `/bookings/${bookingId}/messages`, renterToken);
  check('new booking has an empty thread', r.status === 200 && Array.isArray(r.data) && r.data.length === 0, `${r.status} ${JSON.stringify(r.data)}`);

  r = await request('POST', `/bookings/${bookingId}/messages`, renterToken, { body: '  Is the car available an hour early?  ' });
  check('renter sends a message', r.status === 201 && r.data?.id, `${r.status} ${JSON.stringify(r.data)}`);
  check('message body is trimmed', r.data?.body === 'Is the car available an hour early?', JSON.stringify(r.data?.body));

  r = await request('POST', `/bookings/${bookingId}/messages`, ownerToken, { body: 'Yes, come by at 9.' });
  check('owner replies', r.status === 201 && r.data?.id, `${r.status} ${JSON.stringify(r.data)}`);

  r = await request('GET', `/bookings/${bookingId}/messages`, ownerToken);
  check('owner reads the same thread', r.status === 200 && r.data.length === 2, `${r.status} ${JSON.stringify(r.data)}`);
  check('thread is in send order', r.data[0]?.body === 'Is the car available an hour early?' && r.data[1]?.body === 'Yes, come by at 9.', JSON.stringify(r.data?.map((m) => m.body)));
  check('thread exposes no other participants\' private data', r.data.every((m) => Object.keys(m).sort().join(',') === 'body,created_at,id,sender_id'));
  check('response is not cacheable', (r.headers.get('cache-control') || '').includes('no-store'), r.headers.get('cache-control'));

  r = await request('GET', `/bookings/${bookingId}/messages`, strangerRenterToken);
  check('another renter cannot read the thread', r.status === 404, String(r.status));
  r = await request('POST', `/bookings/${bookingId}/messages`, strangerRenterToken, { body: 'let me in' });
  check('another renter cannot post to it', r.status === 404, String(r.status));
  r = await request('GET', `/bookings/${bookingId}/messages`, strangerOwnerToken);
  check('another owner cannot read the thread', r.status === 404, String(r.status));

  r = await request('POST', `/bookings/${bookingId}/messages`, renterToken, { body: '   ' });
  check('blank message rejected', r.status === 400, String(r.status));
  r = await request('POST', `/bookings/${bookingId}/messages`, renterToken, { body: 'a'.repeat(2001) });
  check('over-long message rejected', r.status === 400, String(r.status));
  r = await request('POST', `/bookings/${bookingId}/messages`, null, { body: 'no token' });
  check('anonymous write rejected', r.status === 401, String(r.status));

  console.log('== Unread badges ==');
  r = await request('GET', '/bookings/messages/unread', ownerToken);
  check('owner has nothing unread after opening the thread', r.status === 200 && r.data.total === 0, `${r.status} ${JSON.stringify(r.data)}`);
  check('unread response is not cacheable', (r.headers.get('cache-control') || '').includes('no-store'), r.headers.get('cache-control'));

  r = await request('GET', '/bookings/messages/unread', renterToken);
  check('renter sees the owner reply as unread', r.status === 200 && r.data.total === 1, `${r.status} ${JSON.stringify(r.data)}`);
  check('the count is attributed to its booking', Array.isArray(r.data.bookings) && r.data.bookings.some((b) => b.booking_id === bookingId && b.unread === 1), JSON.stringify(r.data.bookings));
  check("a participant's own messages never count", r.data.total === 1, String(r.data.total));

  r = await request('GET', '/bookings/messages/unread', strangerRenterToken);
  check('a stranger has no unread for this booking', r.status === 200 && !(r.data.bookings || []).some((b) => b.booking_id === bookingId), JSON.stringify(r.data));

  r = await request('GET', '/bookings/messages/unread', null);
  check('anonymous unread read rejected', r.status === 401, String(r.status));

  await request('GET', `/bookings/${bookingId}/messages`, renterToken);
  r = await request('GET', '/bookings/messages/unread', renterToken);
  check('opening the thread clears the badge', r.status === 200 && r.data.total === 0, JSON.stringify(r.data));

  await request('POST', `/bookings/${bookingId}/messages`, ownerToken, { body: 'One more thing.' });
  r = await request('GET', '/bookings/messages/unread', renterToken);
  check('a new reply raises the badge again', r.data.total === 1, JSON.stringify(r.data));
  r = await request('GET', '/bookings/messages/unread', ownerToken);
  check('your own reply never badges you', r.data.total === 0, JSON.stringify(r.data));

  const persisted = await bookingDb.prepare(`SELECT COUNT(*) AS c FROM booking_messages WHERE booking_id = ?`).get(bookingId);
  check('messages are persisted in the database', persisted.c === 3, JSON.stringify(persisted));

  const deleted = await bookingDb.prepare(`UPDATE bookings SET is_deleted = 1 WHERE id = ?`).run(bookingId);
  check('soft-deleting the booking succeeds', deleted.changes === 1);
  r = await request('GET', `/bookings/${bookingId}/messages`, renterToken);
  check('a deleted booking hides its thread', r.status === 404, String(r.status));
  r = await request('GET', '/bookings/messages/unread', renterToken);
  check('a deleted booking drops out of the badge', r.status === 200 && r.data.total === 0, JSON.stringify(r.data));
}

try {
  await main();
} catch (e) {
  failed += 1;
  console.error('\nCHAT REGRESSION CRASHED:', e.message);
} finally {
  try { await cleanup(); } catch (e) { console.error('cleanup warning:', e.message); }
  await closeAll();
}

console.log(`\n${Math.max(0, checks - failed)} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
