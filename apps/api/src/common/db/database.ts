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

/**
 * Repairs the malformation a hosting dashboard actually produced here: the
 * scheme pasted in front of a URL that already has one, once or several times,
 * giving `postgresql:postgresql://user:pass@host/db` (the variable on the
 * service had two of them).
 *
 * node-postgres reads no host out of that — it dials localhost, and the
 * deployment reports `ECONNREFUSED` with nothing pointing at the variable. The
 * repair is unambiguous: everything before the last `postgresql://` is junk, so
 * the URL is taken from there. A well-formed value has it at index 0 and is
 * returned untouched.
 */
export function normalizeDatabaseUrl(raw: string): string {
  const value = raw.trim();
  const start = Math.max(value.lastIndexOf('postgresql://'), value.lastIndexOf('postgres://'));
  return start > 0 ? value.slice(start) : value;
}

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw || !raw.trim()) {
    throw new Error(
      'DATABASE_URL is not set.\n' +
        `  Add it to ${path.join(API_ROOT, '.env')}\n` +
        '  e.g. DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/cr_dev',
    );
  }
  const url = normalizeDatabaseUrl(raw);
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* reported below with the host check */
  }
  if (!host) {
    throw new Error(
      'DATABASE_URL does not contain a host: ' +
        url.replace(/\/\/[^/\s@]+@/g, '//***@').slice(0, 80),
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
 *
 * A hostname without a dot is never a public endpoint: it is a container or
 * private-network name (Render's `dpg-xxxx-a`, Docker's `postgres`, a bare
 * hostname on a VPC). Those servers reject a TLS negotiation outright —
 * "The server does not support SSL connections" — which reads like a wrong
 * password and kills the boot. So TLS follows the shape of the host unless
 * the URL asks for it explicitly, and DB_SSL=require|disable overrides both.
 */
function sslConfig(url: string): { rejectUnauthorized: boolean } | undefined {
  const mode = (process.env.DB_SSL || 'auto').toLowerCase();
  const verify = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
  if (mode === 'disable' || mode === 'false' || mode === 'off') return undefined;
  if (mode === 'require' || mode === 'true' || mode === 'on') return { rejectUnauthorized: verify };

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* handled by databaseUrl() callers on first query */
  }
  const explicit = /sslmode=require/i.test(url);
  const wantsSsl = explicit || (!isLocalHost(host) && host.includes('.'));
  if (!wantsSsl) return undefined;
  return { rejectUnauthorized: verify };
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
    // Without this, a database that is asleep or unreachable leaves the connect
    // pending for the kernel's SYN retry window (over two minutes on Linux) and
    // every caller waits with it. Ten seconds turns that into an error a request
    // or a health probe can actually report.
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
    idleTimeoutMillis: 30000,
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
 * Error text with any `scheme://user:password@host` credentials stripped, so it
 * is safe to log and to return from the health endpoint. A pg failure can carry
 * an empty message (a socket closed before the handshake), which told nobody
 * anything — the error code is then the only useful part.
 */
export function safeDbError(e: unknown): string {
  const err = e as { message?: string; code?: string; name?: string } | undefined;
  const raw = e instanceof Error ? e.message : String(e ?? '');
  const cleaned = raw.replace(/\/\/[^/\s@]+@/g, '//').slice(0, 300);
  if (cleaned) return cleaned;
  const code = err?.code || err?.name;
  return code ? `database error (${code})` : 'database error (no message)';
}

/**
 * Where DATABASE_URL points, minus the credentials: enough for an operator to see
 * at a glance whether the service is talking to the database they think it is.
 */
export function databaseTarget(): { host: string; database: string } | null {
  try {
    const url = new URL(normalizeDatabaseUrl(process.env.DATABASE_URL || ''));
    return { host: url.hostname || '(empty)', database: url.pathname.replace(/^\//, '') || '(default)' };
  } catch {
    return null;
  }
}

/**
 * Liveness probe, bounded by `timeoutMs` so a wedged connection cannot hang the
 * caller. Never throws: boot-time code and /api/health both want an answer, not
 * an exception.
 */
export async function probeDatabase(timeoutMs = 4000): Promise<{ ok: boolean; error?: string }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no response in ${timeoutMs}ms`)), timeoutMs);
    });
    await Promise.race([getDb('auth').prepare('SELECT 1 AS ok').get(), timedOut]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: safeDbError(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
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

/**
 * Schemas in dependency order.
 *
 * `fs.readdirSync` returns the filesystem's order, and on a brand-new database
 * that started with `agent` — whose 002_crm.sql carries nine foreign keys into
 * `auth.users`. Postgres answered `schema "auth" does not exist`, every later
 * migration was skipped, and the API booted against an empty database. Local
 * databases never showed it because their schemas already existed.
 *
 * auth comes first because identities are what everything else hangs off;
 * anything not listed is appended alphabetically.
 */
const SCHEMA_ORDER: DbName[] = ['auth', 'fleet', 'booking', 'payment', 'agent', 'notification'];

export async function runMigrations(): Promise<void> {
  const dirs = fs.readdirSync(MIGRATIONS_DIR).filter((d) => !d.startsWith('.'));
  const schemas = [
    ...SCHEMA_ORDER.filter((s) => dirs.includes(s)),
    ...dirs.filter((d) => !SCHEMA_ORDER.includes(d as DbName)).sort(),
  ];

  // Phase 1 — create every namespace before any DDL runs inside one. A
  // migration in one schema may reference a table in another, so the schema has
  // to exist first regardless of which directory is processed first.
  for (const dbName of schemas) {
    await getDb(dbName as DbName).exec(`CREATE SCHEMA IF NOT EXISTS "${dbName}"`);
  }

  // Phase 2 — apply the files, schema by schema, file name order.
  for (const dbName of schemas) {
    const db = getDb(dbName as DbName);
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
