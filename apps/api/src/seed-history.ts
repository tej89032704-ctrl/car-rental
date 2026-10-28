import * as bcrypt from 'bcryptjs';
import { getDb, nowUtc, uuid } from './common/db/database';

/**
 * Past trips and reviews, so the demo fleet does not look brand new.
 *
 * Ten cars with no trips behind them means every card reads "★ New", the car
 * page has an empty review list, and the owner's completed-trips page is blank —
 * none of the rating or history UI can be checked. This writes a believable
 * history: completed trips over the last few months, with the reviews both
 * sides leave, using the same row shapes `leaveReview` and `completeTrip`
 * produce so the read paths are exercised exactly as they are in production.
 *
 * Scope, deliberately:
 *
 *  - The demo renters are separate accounts (`*.renter@carent.local`), so the
 *    history belongs to them and not to whoever signs up later.
 *  - The exception is an account that predates this seed: any renter created
 *    before the demo renters existed, and with no bookings of its own, also gets
 *    two past trips — otherwise the person checking the portal signs in and sees
 *    an empty history. The cutoff is the demo renters' own creation time, which
 *    is fixed once they exist, so a signup that happens later is never handed
 *    trips it did not take and re-running adds nothing new.
 *  - A renter who already has a booking is skipped entirely: real history is
 *    never mixed with this.
 *  - No money is invented. The bookings carry their own totals and the 20%
 *    online share, but there is no payment ledger behind them: no transactions,
 *    no wallet credit, no deposit hold. Security deposit is therefore 0, which
 *    also keeps `sweepSettlements` from "refunding" a deposit that was never
 *    collected on the next sweep.
 *
 * Idempotent by (renter, car): a trip that already exists is left alone, so
 * re-running tops up rather than duplicating. The start date deliberately is
 * not part of the key — the dates are relative to today, so keying on them
 * would add another copy of every trip on each new day the seed runs.
 */

const DEMO_PASSWORD = process.env.DEMO_OWNER_PASSWORD || 'Demo@12345';

const RENTERS = [
  { name: 'Aarav Sharma', email: 'aarav.renter@carent.local', phone: '+919800000021' },
  { name: 'Meera Iyer', email: 'meera.renter@carent.local', phone: '+919800000022' },
  { name: 'Karthik Reddy', email: 'karthik.renter@carent.local', phone: '+919800000023' },
];

const CITY = 'Bengaluru';
const STATE = 'Karnataka';
const PINCODE = '560001';

interface Trip {
  /** Demo car plate — the join key, since ids are generated per database. */
  plate: string;
  /** Index into RENTERS. */
  renter: number;
  nights: number;
  /** Days before today the trip started. */
  daysAgo: number;
  rating: number;
  comment: string;
  /** What the owner gave the renter. */
  ownerRating: number;
  ownerComment: string;
}

const TRIPS: Trip[] = [
  {
    plate: 'KA01AB1234', renter: 0, nights: 3, daysAgo: 96, rating: 5,
    comment: 'Spotless little hatch and the owner handed it over in five minutes. Perfect for Bangalore traffic.',
    ownerRating: 5, ownerComment: 'Returned on time and clean. Welcome back any day.',
  },
  {
    plate: 'KA01CD5678', renter: 1, nights: 2, daysAgo: 81, rating: 4,
    comment: 'Gearbox is smooth and the AC is strong. Tank was a little low at pickup.',
    ownerRating: 5, ownerComment: 'Easy handover, car came back exactly as it went out.',
  },
  {
    plate: 'KA02EF9012', renter: 2, nights: 4, daysAgo: 67, rating: 5,
    comment: 'Took it to Coorg and back. Comfortable, quiet, and the host answered every message within minutes.',
    ownerRating: 5, ownerComment: 'Long trip, no issues at all. A pleasure.',
  },
  {
    plate: 'KA03IJ7890', renter: 0, nights: 3, daysAgo: 54, rating: 5,
    comment: 'Big enough for the whole family plus luggage. Pickup was right next to the metro.',
    ownerRating: 4, ownerComment: 'Good renter, returned slightly late but let me know in advance.',
  },
  {
    plate: 'KA04MN6789', renter: 1, nights: 2, daysAgo: 42, rating: 4,
    comment: 'First time driving an EV — the owner walked me through charging and it cost almost nothing to run.',
    ownerRating: 5, ownerComment: 'Took care of the charging routine better than most.',
  },
  {
    plate: 'KA05ST9012', renter: 2, nights: 2, daysAgo: 31, rating: 5,
    comment: 'Spotless inside and out, and the handover was genuinely premium. Worth it for a wedding weekend.',
    ownerRating: 5, ownerComment: 'Respectful and punctual. Happy to host again.',
  },
  {
    plate: 'KA03IJ7890', renter: 1, nights: 5, daysAgo: 21, rating: 4,
    comment: 'Solid highway car. Only note is the fuel level on pickup, everything else was smooth.',
    ownerRating: 5, ownerComment: 'Five days, returned spotless.',
  },
  {
    plate: 'KA01AB1234', renter: 2, nights: 2, daysAgo: 11, rating: 5,
    comment: 'Second time renting this one. Same easy experience — quick approval and a clean car.',
    ownerRating: 5, ownerComment: 'Repeat renter, always a smooth trip.',
  },
  // The remaining four cars, so no card is left reading "New".
  {
    plate: 'KA02GH3456', renter: 2, nights: 3, daysAgo: 74, rating: 4,
    comment: 'Comfortable sedan for a week of meetings. A little road noise on the ORR, nothing else to fault.',
    ownerRating: 5, ownerComment: 'Easy handover and a clean return.',
  },
  {
    plate: 'KA05QR5678', renter: 0, nights: 2, daysAgo: 38, rating: 5,
    comment: 'Feels much bigger inside than it looks. The host even had it washed before pickup.',
    ownerRating: 5, ownerComment: 'Returned spotless and full of fuel. Thank you.',
  },
  {
    plate: 'KA03KL2345', renter: 1, nights: 2, daysAgo: 48, rating: 4,
    comment: 'Rugged and fun, exactly what a Thar should be. The soft top takes a minute to get used to.',
    ownerRating: 4, ownerComment: 'Good trip, returned a bit dusty — expected with this one.',
  },
  {
    plate: 'KA04OP1234', renter: 2, nights: 4, daysAgo: 27, rating: 5,
    comment: 'Airport runs for a family of six, all luggage in the boot. Driver seat is superb on long stretches.',
    ownerRating: 5, ownerComment: 'Careful driver, returned on time.',
  },
];

/** The two trips handed to the oldest real renter account on the very first run. */
const FIRST_RUN_TRIPS: Trip[] = [
  {
    plate: 'KA03KL2345', renter: -1, nights: 2, daysAgo: 18, rating: 5,
    comment: 'Took the Thar up to Nandi Hills for the weekend. Absolutely worth it.',
    ownerRating: 5, ownerComment: 'Came back clean and on time. Welcome back.',
  },
  {
    plate: 'KA04OP1234', renter: -1, nights: 3, daysAgo: 9, rating: 4,
    comment: 'Seven seats was exactly what we needed for the airport runs. Comfortable and quiet.',
    ownerRating: 5, ownerComment: 'Smooth trip, no issues at all.',
  },
];

/** `YYYY-MM-DD`, `offset` days from today. */
function day(offset: number): string {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

/** An instant on a given day, for created/completed timestamps. */
function stamp(offset: number, hour: number): string {
  const d = new Date(Date.now() + offset * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Ensures the demo renters exist, returning their ids in RENTERS order. */
async function ensureRenters(auth: any): Promise<string[]> {
  const ids: string[] = [];
  for (const renter of RENTERS) {
    const email = renter.email.toLowerCase();
    const found = await auth.prepare(`SELECT id FROM users WHERE email = ?`).get(email) as any;
    if (found) {
      ids.push(found.id);
      continue;
    }
    const id = uuid();
    const now = nowUtc();
    await auth.prepare(
      `INSERT INTO users (
         id, name, email, phone, password_hash, role, status, kyc_status,
         address_line, city, state, pincode, phone_verified_at, profile_completed_at,
         created_at, updated_at, created_by
       ) VALUES (?, ?, ?, ?, ?, 'car_renter', 'active', 'approved',
                 ?, ?, ?, ?, ?, ?, ?, ?, 'system')`,
    ).run(
      id, renter.name, email, renter.phone, bcrypt.hashSync(DEMO_PASSWORD, 10),
      'Demo address', CITY, STATE, PINCODE, now, now, now, now,
    );
    ids.push(id);
  }
  return ids;
}

/**
 * One completed trip: the booking row, the status trail it left behind, and the
 * two reviews it earned (the renter's car + owner, and the owner's renter).
 */
async function insertTrip(
  bdb: any,
  trip: Trip,
  car: { id: string; owner_id: string; daily_rate_paise: number },
  renterId: string,
): Promise<boolean> {
  const start = day(-trip.daysAgo);
  const end = day(-trip.daysAgo + trip.nights);

  const existing = await bdb
    .prepare(`SELECT id FROM bookings WHERE renter_id = ? AND car_id = ? AND is_deleted = 0`)
    .get(renterId, car.id) as any;
  if (existing) return false;

  const id = uuid();
  const total = car.daily_rate_paise * trip.nights;
  // The 20% share the renter pays online to confirm, matching PAYMENT_PERCENT's
  // default. The rest was handed over at pickup, so nothing is left due.
  const online = Math.round((total * 20) / 100);

  await bdb.prepare(
    `INSERT INTO bookings (
       id, car_id, renter_id, owner_id, start_date, end_date, status,
       total_amount_paise, online_paid_paise, remaining_due_paise,
       security_deposit_paise, late_fee_paise, completed_at, cancelled_at,
       is_deleted, created_at, updated_at, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, 0, 0, 0, ?, NULL, 0, ?, ?, ?)`,
  ).run(
    id, car.id, renterId, car.owner_id, start, end, total, online,
    stamp(-trip.daysAgo + trip.nights + 1, 18),
    stamp(-trip.daysAgo - 4, 11), stamp(-trip.daysAgo + trip.nights + 1, 18), renterId,
  );

  const trail: Array<{ from: string | null; to: string; by: string; at: string; note: string }> = [
    { from: null, to: 'requested', by: renterId, at: stamp(-trip.daysAgo - 4, 11), note: 'Booking requested' },
    { from: 'requested', to: 'confirmed', by: car.owner_id, at: stamp(-trip.daysAgo - 3, 9), note: 'Approved by the host' },
    { from: 'confirmed', to: 'ongoing', by: car.owner_id, at: stamp(-trip.daysAgo, 10), note: 'Trip started, balance collected at pickup' },
    { from: 'ongoing', to: 'completed', by: car.owner_id, at: stamp(-trip.daysAgo + trip.nights + 1, 18), note: 'Trip completed' },
  ];
  for (const step of trail) {
    await bdb.prepare(
      `INSERT INTO booking_status_history (id, booking_id, old_status, new_status, changed_by, note, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid(), id, step.from, step.to, step.by, step.note, step.at, step.at, step.by);
  }

  // Same two-sided shape leaveReview() writes: the renter rates the car and the
  // owner, the owner rates the renter.
  const review = (targetType: string, targetId: string, reviewer: string, rating: number, comment: string, at: string) =>
    bdb.prepare(
      `INSERT INTO reviews (id, booking_id, reviewer_id, target_type, target_user_id, rating, comment, is_deleted, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).run(uuid(), id, reviewer, targetType, targetId, rating, comment, at, at, reviewer);

  const reviewAt = stamp(-trip.daysAgo + trip.nights + 2, 12);
  await review('car', car.id, renterId, trip.rating, trip.comment, reviewAt);
  await review('owner', car.owner_id, renterId, trip.rating, trip.comment, reviewAt);
  await review('renter', renterId, car.owner_id, trip.ownerRating, trip.ownerComment, reviewAt);

  return true;
}

/**
 * Seeds completed trips and reviews for the demo fleet. Returns how many
 * bookings were created — 0 when there was nothing to do.
 */
export async function ensureDemoHistory(): Promise<number> {
  if (/^(0|false|no|off)$/i.test(String(process.env.SEED_DEMO_HISTORY || '').trim())) {
    console.log('[seed] demo history disabled by SEED_DEMO_HISTORY');
    return 0;
  }

  const auth = getDb('auth');
  const fleet = getDb('fleet');
  const bdb = getDb('booking');

  // Cars first: history hangs off the demo fleet, so a database without it has
  // nothing to seed (fleet seeding may be switched off, or have been skipped).
  const plates = [...new Set([...TRIPS, ...FIRST_RUN_TRIPS].map((t) => t.plate))];
  const rows = await fleet
    .prepare(
      `SELECT c.id, c.owner_id, c.plate_number, p.daily_rate_paise
         FROM cars c LEFT JOIN car_pricing p ON p.car_id = c.id
        WHERE c.is_deleted = 0 AND c.plate_number IN (${plates.map(() => '?').join(',')})`,
    )
    .all(...plates) as any[];
  if (!rows.length) {
    console.log('[seed] no demo cars — demo history skipped');
    return 0;
  }

  const cars = new Map<string, { id: string; owner_id: string; daily_rate_paise: number }>();
  for (const r of rows) {
    cars.set(r.plate_number, { id: r.id, owner_id: r.owner_id, daily_rate_paise: Number(r.daily_rate_paise) || 0 });
  }

  const renterIds = await ensureRenters(auth);
  let created = 0;

  for (const trip of TRIPS) {
    const car = cars.get(trip.plate);
    const renterId = renterIds[trip.renter];
    if (!car || !renterId) continue;
    if (await insertTrip(bdb, trip, car, renterId)) created += 1;
  }

  // Any renter who was here before the demo renters, and who has no bookings of
  // their own, gets the two extra trips. The cutoff makes this stable: demo
  // renters were created first, so a later signup can never qualify.
  const since = await auth
    .prepare(
      `SELECT MIN(created_at) AS at FROM users WHERE email IN (${RENTERS.map(() => '?').join(',')})`,
    )
    .get(...RENTERS.map((r) => r.email.toLowerCase())) as any;
  if (since?.at) {
    const candidates = await auth
      .prepare(
        `SELECT id, name FROM users
          WHERE role = 'car_renter' AND status = 'active' AND is_deleted = 0
            AND created_at < ? AND email NOT IN (${RENTERS.map(() => '?').join(',')})
          ORDER BY created_at ASC LIMIT 5`,
      )
      .all(since.at, ...RENTERS.map((r) => r.email.toLowerCase())) as any[];

    for (const candidate of candidates) {
      const own = await bdb
        .prepare(`SELECT COUNT(*) AS c FROM bookings WHERE renter_id = ? AND is_deleted = 0`)
        .get(candidate.id) as any;
      if (Number(own?.c || 0) > 0) continue;

      for (const trip of FIRST_RUN_TRIPS) {
        const car = cars.get(trip.plate);
        if (!car) continue;
        if (await insertTrip(bdb, trip, car, candidate.id)) created += 1;
      }
      console.log(`[seed] history added to an existing renter account: ${candidate.name}`);
    }
  }

  if (created) {
    console.log(`[seed] demo history created: ${created} completed trips with reviews`);
    console.log(`[seed] renter login: ${RENTERS[0].email} / ${DEMO_PASSWORD}`);
  }
  return created;
}
