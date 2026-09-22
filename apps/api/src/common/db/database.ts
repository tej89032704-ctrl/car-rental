import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export type DbName = 'auth' | 'fleet' | 'booking' | 'payment' | 'agent' | 'notification';

const API_ROOT = path.resolve(__dirname, '../../..');
const DATA_DIR = path.join(API_ROOT, 'data');
const MIGRATIONS_DIR = path.join(API_ROOT, 'migrations');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const connections = new Map<DbName, Database.Database>();

export function getDb(name: DbName): Database.Database {
  let db = connections.get(name);
  if (!db) {
    db = new Database(path.join(DATA_DIR, `${name}.db`));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    connections.set(name, db);
  }
  return db;
}

export function runMigrations(): void {
  const dbs = fs.readdirSync(MIGRATIONS_DIR).filter((d) => !d.startsWith('.'));
  for (const dbName of dbs) {
    const db = getDb(dbName as DbName);
    db.exec(
      `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
    );
    const applied = new Set(
      (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
    );
    const files = fs
      .readdirSync(path.join(MIGRATIONS_DIR, dbName))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, dbName, file), 'utf-8');
      const tx = db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
          file,
          new Date().toISOString(),
        );
      });
      tx();
      console.log(`[migrate] ${dbName}/${file} applied`);
    }
  }
}

export function nowUtc(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return require('crypto').randomUUID();
}
