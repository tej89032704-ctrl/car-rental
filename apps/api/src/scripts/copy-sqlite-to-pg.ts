/**
 * One-shot copy of the six SQLite databases into their matching Postgres
 * schemas. IDs are preserved verbatim so photos, bookings and foreign keys
 * still line up with what is already on disk under apps/api/uploads.
 *
 * Run AFTER runMigrations() so the target tables exist. Each table is
 * truncated first, which also replaces the rows the migrations seed
 * (roles, platform_settings) with the live SQLite versions - so the copy
 * is an exact snapshot rather than a merge.
 *
 *   npx tsx src/scripts/copy-sqlite-to-pg.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { DbName, getDb, runMigrations } from '../common/db/database';

const SCHEMAS: DbName[] = ['auth', 'fleet', 'booking', 'payment', 'agent', 'notification'];
// `src/scripts` and `dist/scripts` are both one level under apps/api, so
// two levels up resolves to apps/api regardless of which one is running.
const DATA_DIR = path.resolve(__dirname, '../../data');
const BATCH = 200;

async function copyTable(
  db: ReturnType<typeof getDb>,
  schema: string,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const info = await db
    .prepare(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
    )
    .all(schema, table);
  const pgCols = new Set(info.map((r: any) => r.column_name));

  const srcCols = rows.length ? Object.keys(rows[0]) : [];
  const unknown = srcCols.filter((c) => !pgCols.has(c));
  if (unknown.length) {
    throw new Error(`${schema}.${table}: SQLite has columns Postgres does not: ${unknown.join(', ')}`);
  }
  const cols = srcCols.filter((c) => pgCols.has(c));

  // Drop the table first so migration-seeded rows cannot collide with the copy.
  await db.exec(`TRUNCATE TABLE "${schema}"."${table}" CASCADE`);
  if (!rows.length) return;

  const colSql = cols.map((c) => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const stmt = db.prepare(
    `INSERT INTO "${schema}"."${table}" (${colSql}) VALUES (${placeholders})`,
  );

  // Chunked so a single round trip carries many rows rather than one per row.
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await db.transaction(async () => {
      for (const row of slice) {
        await stmt.run(...cols.map((c) => row[c] ?? null));
      }
    });
  }
}

async function main() {
  await runMigrations();
  let totalRows = 0;
  let totalTables = 0;

  for (const schema of SCHEMAS) {
    const file = path.join(DATA_DIR, `${schema}.db`);
    if (!fs.existsSync(file)) {
      console.warn(`! skipping ${schema} - no ${file}`);
      continue;
    }
    const src = new Database(file, { readonly: true });
    const tables = (
      src
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        )
        .all() as { name: string }[]
    ).map((t) => t.name);

    // `users` has a foreign key to `roles`; put the parent first so the
    // constraint is satisfied as soon as the rows land.
    tables.sort((a, b) => (a === 'roles' ? -1 : b === 'roles' ? 1 : 0));

    const dst = getDb(schema);
    console.log(`\n[${schema}]`);
    for (const table of tables) {
      const rows = src.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      await copyTable(dst, schema, table, rows);
      console.log(`  ${table.padEnd(26)} ${rows.length}`);
      totalRows += rows.length;
      totalTables++;
    }
    src.close();
  }

  console.log(`\ncopied ${totalRows} rows across ${totalTables} tables`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nCOPY FAILED:', err?.message ?? err);
    process.exit(1);
  },
);
