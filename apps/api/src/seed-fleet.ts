import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { getDb, nowUtc, uuid } from './common/db/database';
import { StorageService, UPLOAD_DIR } from './common/db/storage.service';
import { renderDemoCarPhotos } from './demo-car-photos';

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
 * `npm run seed:fleet`.
 *
 * The demo cars also step aside once the site has real listings: when any car
 * that is not one of ours is live, the demo ones are set to `inactive`, which
 * hides them from browse and from the car page without deleting the rows, their
 * photos or their reviews. HIDE_DEMO_FLEET=1 hides them immediately regardless,
 * and HIDE_DEMO_FLEET=0 turns the automatic hiding off, leaving demo and real
 * listings side by side.
 *
 * Photos are generated as SVG (see demo-car-photos.ts) and written through the
 * same StorageService a real owner's upload goes through, because `uploads/` is
 * gitignored and the runtime image carries only `dist` — a bundled JPEG would
 * never reach the container. Four views per car give the gallery something to
 * page through and give the card a cover image.
 *
 * The photo step is deliberately separate from the car step and keyed on plate
 * number, so it also fills in photos for a fleet created by an earlier version
 * of this seed, and heals itself after a redeploy wipes the ephemeral disk
 * (the rows would otherwise point at URLs that 404).
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
  /** Body colour the generated photos are painted in. */
  paint: string;
}

const CARS: DemoCar[] = [
  { host: 0, make: 'Maruti Suzuki', model: 'Swift', year: 2023, plate: 'KA01AB1234', category: 'hatchback', transmission: 'manual', fuel: 'petrol', seats: 5, daily: 2200, deposit: 5000, paint: '#C8202F' },
  { host: 0, make: 'Hyundai', model: 'i20', year: 2022, plate: 'KA01CD5678', category: 'hatchback', transmission: 'automatic', fuel: 'petrol', seats: 5, daily: 2600, deposit: 5000, paint: '#2B4C7E' },
  { host: 1, make: 'Honda', model: 'City', year: 2023, plate: 'KA02EF9012', category: 'sedan', transmission: 'automatic', fuel: 'petrol', seats: 5, daily: 3400, deposit: 8000, paint: '#E4E7EC' },
  { host: 1, make: 'Hyundai', model: 'Verna', year: 2022, plate: 'KA02GH3456', category: 'sedan', transmission: 'manual', fuel: 'petrol', seats: 5, daily: 3100, deposit: 7000, paint: '#585F68' },
  { host: 2, make: 'Hyundai', model: 'Creta', year: 2023, plate: 'KA03IJ7890', category: 'suv', transmission: 'automatic', fuel: 'diesel', seats: 5, daily: 4200, deposit: 10000, paint: '#1D4E6B' },
  { host: 2, make: 'Mahindra', model: 'Thar', year: 2023, plate: 'KA03KL2345', category: 'suv', transmission: 'manual', fuel: 'diesel', seats: 4, daily: 4800, deposit: 12000, paint: '#23262B' },
  { host: 1, make: 'Tata', model: 'Nexon EV', year: 2023, plate: 'KA04MN6789', category: 'suv', transmission: 'automatic', fuel: 'ev', seats: 5, daily: 3900, deposit: 10000, paint: '#0E7490' },
  { host: 0, make: 'Toyota', model: 'Innova Crysta', year: 2022, plate: 'KA04OP1234', category: 'van', transmission: 'manual', fuel: 'diesel', seats: 7, daily: 5200, deposit: 12000, paint: '#C9CDD3' },
  { host: 2, make: 'Kia', model: 'Seltos', year: 2023, plate: 'KA05QR5678', category: 'suv', transmission: 'automatic', fuel: 'petrol', seats: 5, daily: 4000, deposit: 9000, paint: '#8B1E3F' },
  { host: 1, make: 'BMW', model: '3 Series', year: 2022, plate: 'KA05ST9012', category: 'luxury', transmission: 'automatic', fuel: 'petrol', seats: 5, daily: 9500, deposit: 25000, paint: '#0B1F33' },
];

/** How many photos each demo car should end up with. */
const PHOTOS_PER_CAR = 4;

/** The plates this file owns — the only rows visibility management may touch. */
const DEMO_PLATES = CARS.map((c) => c.plate);

/**
 * What to do about visible demo cars:
 *
 *  - `auto` (default) hides them only once a real listing is live;
 *  - `always` (HIDE_DEMO_FLEET=1) hides them now;
 *  - `never` (HIDE_DEMO_FLEET=0) leaves them alone even when real cars exist.
 *
 * Unrecognised values fall back to `auto`, so a typo cannot silence the demo
 * fleet on a database that has nothing else to show.
 */
function hideMode(): 'auto' | 'always' | 'never' {
  const raw = String(process.env.HIDE_DEMO_FLEET || '').trim().toLowerCase();
  if (/^(1|true|yes|on)$/.test(raw)) return 'always';
  if (/^(0|false|no|off)$/.test(raw)) return 'never';
  return 'auto';
}

/** Inactivates every demo car that is still live. Returns how many it hid. */
async function hideDemoCars(reason: string): Promise<number> {
  const fleet = getDb('fleet');
  const live = await fleet
    .prepare(
      `SELECT id FROM cars WHERE status = 'active' AND is_deleted = 0
        AND plate_number IN (${DEMO_PLATES.map(() => '?').join(',')})`,
    )
    .all(...DEMO_PLATES) as any[];
  if (!live.length) return 0;

  const now = nowUtc();
  for (const car of live) {
    await fleet
      .prepare(`UPDATE cars SET status = 'inactive', updated_at = ? WHERE id = ?`)
      .run(now, car.id);
  }
  console.log(`[seed] demo fleet hidden: ${live.length} car(s) set to inactive — ${reason}`);
  return live.length;
}

/**
 * Takes the demo fleet out of the catalogue once it has done its job.
 *
 * `inactive` rather than a delete: every foreign key stays intact (photos,
 * bookings, reviews), nothing is destroyed, and the rows can be brought back by
 * flipping the listing back to active. Browse and the car page both filter on
 * active, so the effect for a renter is that the demo cars simply disappear.
 *
 * Only licences with our own plates are ever touched, so a real listing can
 * never be hidden by mistake. Runs on every boot and again whenever a listing
 * goes live (admin approval, owner resume), and is a no-op once they are already
 * inactive.
 */
export async function enforceDemoFleetVisibility(): Promise<number> {
  const mode = hideMode();
  if (mode === 'never') return 0;
  if (mode === 'always') return await hideDemoCars('HIDE_DEMO_FLEET is set');

  const real = await getDb('fleet')
    .prepare(
      `SELECT COUNT(*) AS c FROM cars WHERE status = 'active' AND is_deleted = 0
        AND plate_number NOT IN (${DEMO_PLATES.map(() => '?').join(',')})`,
    )
    .get(...DEMO_PLATES) as any;
  const realCount = Number(real?.c || 0);
  if (!realCount) return 0;
  return await hideDemoCars(`${realCount} real listing(s) are live`);
}

/**
 * Writes generated photos for the demo cars that do not already have usable
 * ones, and returns how many images it created.
 *
 * Keyed on plate number and scoped to this file's own fleet, so it can run on a
 * database that already has the cars — that is how the first version of this
 * seed, which created cars without photos, gets them filled in.
 *
 * It leaves intact photos alone in both directions: a car whose rows all still
 * resolve to files keeps them (an owner's own uploads are not touched), and
 * only rows whose bytes are gone are dropped. That second case is not
 * hypothetical — Render gives the container an ephemeral filesystem, so a
 * redeploy empties `uploads/` while the rows survive, and a row that 404s is
 * worse than no row: the card renders a broken image instead of its fallback.
 */
async function ensureDemoPhotos(): Promise<number> {
  const fleet = getDb('fleet');
  const storage = new StorageService();
  const plates = CARS.map((c) => c.plate);

  const cars = await fleet
    .prepare(
      `SELECT id, owner_id, plate_number FROM cars
        WHERE is_deleted = 0 AND plate_number IN (${plates.map(() => '?').join(',')})`,
    )
    .all(...plates) as any[];
  if (!cars.length) return 0;

  const stillServed = (fileUrl: string) => {
    const key = path.basename(String(fileUrl || ''));
    return !!key && fs.existsSync(path.join(UPLOAD_DIR, key));
  };

  let written = 0;
  for (const car of cars) {
    const demo = CARS.find((c) => c.plate === car.plate_number);
    if (!demo) continue;

    const rows = await fleet
      .prepare(`SELECT id, file_url FROM car_photos WHERE car_id = ? AND is_deleted = 0`)
      .all(car.id) as any[];
    const stale = rows.filter((r) => !stillServed(r.file_url));
    if (rows.length > 0 && stale.length === 0) continue;

    for (const row of stale) {
      await fleet.prepare(`DELETE FROM car_photos WHERE id = ?`).run(row.id);
    }

    const kept = rows.length - stale.length;
    const need = Math.max(0, PHOTOS_PER_CAR - kept);
    if (!need) continue;

    const views = renderDemoCarPhotos({
      make: demo.make,
      model: demo.model,
      category: demo.category,
      paint: demo.paint,
    });
    for (let i = 0; i < need; i += 1) {
      const view = views[(kept + i) % views.length];
      const url = storage.saveBuffer(Buffer.from(view.svg, 'utf8'), '.svg');
      await fleet.prepare(
        `INSERT INTO car_photos (id, car_id, file_url, sort_order, created_at, updated_at, created_by)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM car_photos WHERE car_id = ?), ?, ?, ?)`,
      ).run(uuid(), car.id, url, car.id, nowUtc(), nowUtc(), car.owner_id);
      written += 1;
    }
  }

  if (written) console.log(`[seed] demo car photos written: ${written} image(s)`);
  return written;
}

/**
 * Fills an empty fleet with the demo catalogue. Returns how many cars were
 * created — 0 when the fleet already had something in it, which is the normal
 * case on every boot after the first.
 */
export async function ensureDemoFleet(): Promise<number> {
  // Visibility first, and before the seeding switch: a database that already
  // has demo cars should lose them once real ones are live even if seeding
  // itself has been switched off.
  await enforceDemoFleetVisibility();

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
    // The cars are already here, but the photos may not be (this seed shipped
    // without them first, and every redeploy empties the uploads directory).
    await ensureDemoPhotos();
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

  await ensureDemoPhotos();

  console.log(
    `[seed] demo fleet created: ${created} cars in ${CITY} across ${HOSTS.length} hosts`,
  );
  console.log(`[seed] host login: ${HOSTS[0].email} / ${DEMO_PASSWORD}`);

  // The visibility pass at the top ran before these rows existed, so an
  // explicit HIDE_DEMO_FLEET=1 would otherwise seed a brand-new database with
  // a perfectly visible demo fleet. Hide what was just created; the rows stay
  // for testing, they are simply not in the catalogue.
  if (hideMode() === 'always') {
    await hideDemoCars('HIDE_DEMO_FLEET is set');
  }
  return created;
}
