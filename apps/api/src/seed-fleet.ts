import * as bcrypt from 'bcryptjs';
import { getDb, nowUtc, uuid } from './common/db/database';

/**
 * Demo cars so a renter has something to book before real hosts sign up.
 *
 * A migrated database is a whole product with an empty catalogue: the renter
 * portal is reachable, the search bar works, and every query answers "Nothing
 * matches yet", which makes it impossible to tell a working site from a broken
 * one. This fills that gap with a believable Bengaluru fleet.
 *
 * Two properties make it safe to run on every boot:
 *
 *  1. It only ever touches an *empty* fleet. One row that is not ours and the
 *     function returns without writing anything, so real listings can never be
 *     duplicated or overwritten by demo data.
 *  2. It is idempotent by that same check — the hosts are addressed by email,
 *     so a database that already has them is left alone.
 *
 * Set SEED_DEMO_FLEET=0 to switch it off entirely, or run it by hand with
 * `npm run seed:fleet`. Photos are deliberately left out: the cards fall back
 * to the portal's own car artwork, which looks better than a broken image and
 * keeps the demo free of hotlinked assets.
 */

const DEMO_PASSWORD = process.env.DEMO_OWNER_PASSWORD || 'Demo@12345';

const HOSTS = [
  { name: 'Ravi Kumar', email: 'ravi.host@carent.local', phone: '+919800000011' },
  { name: 'Ananya Rao', email: 'ananya.host@carent.local', phone: '+919800000012' },
  { name: 'Zeeshan Ali', email: 'zeeshan.host@carent.local', phone: '+919800000013' },
];

/** Bengaluru: the fleet every demo starts from. */
const CITY = 'Bengaluru';
const STATE = 'Karnataka';
const PINCODE = '560001';
const LATITUDE = 12.9716;
const LONGITUDE = 77.5946;

interface DemoCar {
  host: number;
  make: string;
  model: string;
  year: number;
  plate: string;
  category: 'hatchback' | 'sedan' | 'suv' | 'luxury' | 'van';
  transmission: 'manual' | 'automatic';
  fuel: 'petrol' | 'diesel' | 'ev' | 'cng';
  seats: number;
  /** Rupees per day; the schema stores paise. */
  daily: number;
  deposit: number;
}

const CARS: DemoCar[] = [
  { host: 0, make: 'Maruti Suzuki', model: 'Swift', year: 2023, plate: 'KA01AB1234', category: 'hatchback', transmission: 'manual', fuel: 'petrol', seats: 5, daily: 2200, deposit: 5000 },
  { host: 0, make: 'Hyundai', model: 'i20', year: 2022, plate: 'KA01CD5678', category: 'hatchback', transmission: 'automatic', fuel: 'petrol', seats: 5, daily: 2600, deposit: 5000 },
  { host: 1, make: 'Honda', model: 'City', year: 2023, plate: 'KA02EF9012', category: 'sedan', transmission: 'automatic', fuel: 'petrol', seats: 5, daily: 3400, deposit: 8000 },
  { host: 1, make: 'Hyundai', model: 'Verna', year: 2022, plate: 'KA02GH3456', category: 'sedan', transmission: 'manual', fuel: 'petrol', seats: 5, daily: 3100, deposit: 7000 },
  { host: 2, make: 'Hyundai', model: 'Creta', year: 2023, plate: 'KA03IJ7890', category: 'suv', transmission: 'automatic', fuel: 'diesel', seats: 5, daily: 4200, deposit: 10000 },
  { host: 2, make: 'Mahindra', model: 'Thar', year: 2023, plate: 'KA03KL2345', category: 'suv', transmission: 'manual', fuel: 'diesel', seats: 4, daily: 4800, deposit: 12000 },
  { host: 1, make: 'Tata', model: 'Nexon EV', year: 2023, plate: 'KA04MN6789', category: 'suv', transmission: 'automatic', fuel: 'ev', seats: 5, daily: 3900, deposit: 10000 },
  { host: 0, make: 'Toyota', model: 'Innova Crysta', year: 2022, plate: 'KA04OP1234', category: 'van', transmission: 'manual', fuel: 'diesel', seats: 7, daily: 5200, deposit: 12000 },
  { host: 2, make: 'Kia', model: 'Seltos', year: 2023, plate: 'KA05QR5678', category: 'suv', transmission: 'automatic', fuel: 'petrol', seats: 5, daily: 4000, deposit: 9000 },
  { host: 1, make: 'BMW', model: '3 Series', year: 2022, plate: 'KA05ST9012', category: 'luxury', transmission: 'automatic', fuel: 'petrol', seats: 5, daily: 9500, deposit: 25000 },
];

/**
 * Fills an empty fleet with the demo catalogue. Returns how many cars were
 * created — 0 when the fleet already had something in it, which is the normal
 * case on every boot after the first.
 */
export async function ensureDemoFleet(): Promise<number> {
  if (/^(0|false|no|off)$/i.test(String(process.env.SEED_DEMO_FLEET || '').trim())) {
    console.log('[seed] demo fleet disabled by SEED_DEMO_FLEET');
    return 0;
  }

  const fleet = getDb('fleet');
  const auth = getDb('auth');

  // Never write into a database that already has listings: those are either a
  // real fleet or a previous run of this seed, and both must be left alone.
  const counted = await fleet
    .prepare(`SELECT COUNT(*) AS c FROM cars WHERE is_deleted = 0`)
    .get() as any;
  const existingCars = Number(counted?.c || 0);
  if (existingCars > 0) {
    console.log(`[seed] fleet already has ${existingCars} car(s) — demo seed skipped`);
    return 0;
  }

  // Hosts first: a car without an owner is invisible in every join.
  const hostIds: string[] = [];
  let created = 0;
  for (const host of HOSTS) {
    const email = host.email.toLowerCase();
    const found = await auth.prepare(`SELECT id FROM users WHERE email = ?`).get(email) as any;
    if (found) {
      hostIds.push(found.id);
      continue;
    }

    const id = uuid();
    const now = nowUtc();
    await auth.prepare(
      `INSERT INTO users (
         id, name, email, phone, password_hash, role, status, kyc_status,
         address_line, city, state, pincode, latitude, longitude, location_source,
         phone_verified_at, profile_completed_at, created_at, updated_at, created_by
       ) VALUES (?, ?, ?, ?, ?, 'car_owner', 'active', 'approved',
                 ?, ?, ?, ?, ?, ?, 'manual',
                 ?, ?, ?, ?, 'system')`,
    ).run(
      id, host.name, email, host.phone, bcrypt.hashSync(DEMO_PASSWORD, 10),
      `Demo fleet address, ${CITY}`, CITY, STATE, PINCODE, LATITUDE, LONGITUDE,
      now, now, now, now,
    );
    hostIds.push(id);
  }

  for (const car of CARS) {
    const carId = uuid();
    const now = nowUtc();
    const ownerId = hostIds[car.host] ?? hostIds[0];

    // 'active' rather than 'pending_review': these exist to be browsed and
    // booked, and the review queue is the admin portal's own feature to test.
    await fleet.prepare(
      `INSERT INTO cars (
         id, owner_id, make, model, year, plate_number, category, transmission,
         fuel_type, seats, status, created_at, updated_at, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).run(
      carId, ownerId, car.make, car.model, car.year, car.plate, car.category,
      car.transmission, car.fuel, car.seats, now, now, ownerId,
    );

    await fleet.prepare(
      `INSERT INTO car_pricing (
         id, car_id, daily_rate_paise, weekly_rate_paise, monthly_rate_paise,
         security_deposit_paise, created_at, updated_at, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuid(), carId,
      car.daily * 100,
      car.daily * 6 * 100,
      car.daily * 22 * 100,
      car.deposit * 100,
      now, now, ownerId,
    );

    created += 1;
  }

  console.log(
    `[seed] demo fleet created: ${created} cars in ${CITY} across ${HOSTS.length} hosts`,
  );
  console.log(`[seed] host login: ${HOSTS[0].email} / ${DEMO_PASSWORD}`);
  return created;
}
