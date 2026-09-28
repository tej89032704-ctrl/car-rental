import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { DbName, PgDb } from './postgres';

export type { DbName } from './postgres';

const API_ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(API_ROOT, 'migrations');

/**
 * Minimal .env reader — this project has no dotenv dependency and never had
 * one, so nothing in apps/api/.env was actually reaching process.env before.
 * Standard semantics: a variable already present in the environment wins, so
 * real env vars still override the file.
 */
function loadDotEnv(): void {
  const file = path.join(API_ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadDotEnv();

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set.\n' +
        `  Add it to ${path.join(API_ROOT, '.env')}\n` +
        '  e.g. DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/cr_dev',
    );
  }
  return url;
}

function isLocalHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|::1|\[::1\])$/i.test(host);
}

/**
 * Postgres needs TLS off-host. node-postgres does not reliably honour
 * sslmode= in the connection string, so it is set explicitly. Certificate
 * verification is off by default because Supabase's pooler commonly fails
 * chain verification from Windows without extra CA setup; traffic is still
 * encrypted and access is still gated by the keys. Set
 * DB_SSL_REJECT_UNAUTHORIZED=true to verify the chain.
 */
function sslConfig(url: string): { rejectUnauthorized: boolean } | undefined {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* handled by databaseUrl() callers on first query */
  }
  const wantsSsl = /sslmode=require/i.test(url) || !isLocalHost(host);
  if (!wantsSsl) return undefined;
  return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' };
}

/**
 * Each logical SQLite database is now a Postgres *schema* inside the one
 * Supabase database (Supabase does not allow multiple databases per project).
 *
 * The schema is bound with search_path rather than by prefixing every table,
 * so the 282 existing statements keep naming their tables exactly as before.
 * This also keeps `audit_logs` — which exists in five of the six databases —
 * correctly separated instead of colliding in one namespace.
 */
/**
 * A plain record rather than a Map: `Map.get()` shares its name with the async
 * `Statement.get()`, and the await-propagation pass would otherwise await it
 * and drag this synchronous factory into becoming async.
 */
const connections = {} as Record<DbName, PgDb>;

export function getDb(name: DbName): PgDb {
  const existing = connections[name];
  if (existing) return existing;

  const url = databaseUrl();
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || 5),
    options: `-c search_path=${name}`,
    ssl: sslConfig(url),
  });
  // An idle client that dies (server restart, pooler recycle) would otherwise
  // take the whole process down with an unhandled 'error'.
  pool.on('error', (err: Error) => console.error(`[pg:${name}] idle client: ${err.message}`));

  const db = new PgDb(name, pool);
  connections[name] = db;
  return db;
}

export async function closeAll(): Promise<void> {
  const open = Object.values(connections);
  for (const key of Object.keys(connections)) delete (connections as any)[key];
  await Promise.all(open.map(async (db) => await db.end()));
}

/**
 * SQLite-only syntax that Postgres would reject outright. Caught here rather
 * than at query time so a future migration fails while it is being written.
 */
const SQLITE_ONLY = /\b(AUTOINCREMENT|WITHOUT\s+ROWID|PRAGMA|strftime|julianday|INSERT\s+OR\s+)\b/i;

function toPostgresSql(sql: string, label: string): string {
  const bad = sql.match(SQLITE_ONLY);
  if (bad) {
    throw new Error(
      `[migrate] ${label} uses SQLite-only syntax "${bad[0]}" — rewrite it for Postgres`,
    );
  }
  // datetime('now') is the only SQLite-ism the current migrations rely on.
  // to_char(... ) matches new Date().toISOString(), which is what nowUtc()
  // writes for every other row, so seeded rows look identical.
  return sql.replace(
    /\bdatetime\(\s*'now'\s*\)/gi,
    `to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
  );
}

export async function runMigrations(): Promise<void> {
  const schemas = fs.readdirSync(MIGRATIONS_DIR).filter((d) => !d.startsWith('.'));
  for (const dbName of schemas) {
    const db = getDb(dbName as DbName);
    // A new database only has `public`; search_path=name would otherwise point
    // at a schema that does not exist and CREATE TABLE would have nowhere to go.
    await db.exec(`CREATE SCHEMA IF NOT EXISTS "${dbName}"`);
    await db.exec(
      `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
    );
    const applied = new Set(
      (await db.prepare('SELECT name FROM _migrations').all()).map((r) => r.name),
    );
    const files = fs
      .readdirSync(path.join(MIGRATIONS_DIR, dbName))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const label = `${dbName}/${file}`;
      const sql = toPostgresSql(
        fs.readFileSync(path.join(MIGRATIONS_DIR, dbName, file), 'utf-8'),
        label,
      );
      await db.transaction(async () => {
        await db.exec(sql);
        await db
          .prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')
          .run(file, nowUtc());
      });
      console.log(`[migrate] ${label} applied`);
    }
  }
}

export function nowUtc(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return require('crypto').randomUUID();
}
