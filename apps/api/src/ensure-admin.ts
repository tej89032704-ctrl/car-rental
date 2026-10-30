import * as bcrypt from 'bcryptjs';
import { getDb, nowUtc, uuid } from './common/db/database';

/**
 * Creates the super-admin account if it is not there yet.
 *
 * Idempotent by construction — an existing account is returned untouched — so
 * it is safe to run on every boot. Production runs it once at start-up because
 * a freshly migrated database has tables but no way into the admin portal at
 * all; `npm run seed:admin` runs the same function from the command line.
 *
 * Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD when set, otherwise the
 * demo defaults. Returns the account's email.
 */
export async function ensureSuperAdmin(): Promise<string> {
  const db = getDb('auth');
  const email = (process.env.ADMIN_EMAIL || 'admin@platform.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';

  const existing = await db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    return email;
  }

  // `phone` is UNIQUE and a staff account has no real number, so the
  // placeholder has to be a free one. A deployment that seeded the demo admin
  // and then gained a real ADMIN_EMAIL used to hit the unique constraint on
  // this insert; because seeding runs in the boot path, that failure left
  // readiness stuck on "migrating" and the new admin never appeared. n=0 is
  // the historical placeholder, so an existing deployment is unchanged.
  const placeholderPhone = async (): Promise<string> => {
    for (let n = 0; n < 100; n += 1) {
      const candidate = `+91${String(n).padStart(10, '0')}`;
      const taken = await db.prepare(`SELECT id FROM users WHERE phone = ?`).get(candidate);
      if (!taken) return candidate;
    }
    throw new Error('every placeholder phone number for super admins is taken');
  };

  const id = uuid();
  await db
    .prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'super_admin', 'active', ?, ?, 'system')`,
    )
    .run(id, 'Super Admin', email, await placeholderPhone(), bcrypt.hashSync(password, 10), nowUtc(), nowUtc());
  console.log(`Super admin created: ${email} / ${password}`);
  return email;
}
