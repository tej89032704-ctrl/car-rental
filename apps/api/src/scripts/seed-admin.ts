import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { getDb, nowUtc, runMigrations, uuid } from '../common/db/database';

async function main() {
  await runMigrations();
  const db = getDb('auth');
  const email = (process.env.ADMIN_EMAIL || 'admin@platform.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';

  const existing = await db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    process.exit(0);
  }
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'super_admin', 'active', ?, ?, 'system')`,
    )
    .run(id, 'Super Admin', email, '+910000000000', bcrypt.hashSync(password, 10), nowUtc(), nowUtc());
  console.log(`Super admin created: ${email} / ${password}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
