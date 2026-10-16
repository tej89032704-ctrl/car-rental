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

  const id = uuid();
  await db
    .prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'super_admin', 'active', ?, ?, 'system')`,
    )
    .run(id, 'Super Admin', email, '+910000000000', bcrypt.hashSync(password, 10), nowUtc(), nowUtc());
  console.log(`Super admin created: ${email} / ${password}`);
  return email;
}
