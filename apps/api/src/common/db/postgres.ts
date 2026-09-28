import { Pool, PoolClient, types } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';

export type DbName = 'auth' | 'fleet' | 'booking' | 'payment' | 'agent' | 'notification';

/**
 * Postgres returns int8 (COUNT(*), SUM(...) over a bigint) as a *string*.
 * Every count in this codebase is small, so read them as numbers — otherwise
 * `rows.length`-style checks silently compare `"5" > 4`.
 */
types.setTypeParser(20, (v: string) => parseInt(v, 10));

/**
 * Rewrite SQLite's `?` placeholders to Postgres `$1..$n`.
 *
 * Numbered by hand across the codebase would mean 282 chances to misnumber a
 * statement, so it is done once, here, where it can be tested. Text literals
 * and `--` comments are skipped so a literal question mark never shifts the
 * numbering.
 */
export function toPgPlaceholders(sql: string): string {
  let out = '';
  let n = 0;
  let i = 0;
  let inString = false;
  while (i < sql.length) {
    const ch = sql[i];

    if (inString) {
      out += ch;
      // '' inside a literal is an escaped quote, not a terminator
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === "'") {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const eol = sql.indexOf('\n', i);
      if (eol === -1) return out + sql.slice(i);
      out += sql.slice(i, eol + 1);
      i = eol + 1;
      continue;
    }
    if (ch === '?') {
      n++;
      out += `$${n}`;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Statements pinned to a connection for the duration of a transaction.
 *
 * A plain field would leak between requests: Node is single-threaded but
 * async, so while one request awaits its transaction a second request would
 * read the first one's client. AsyncLocalStorage follows the async call chain
 * instead, so concurrent transactions stay isolated. The map is keyed by
 * schema because a transaction on `booking` can legitimately read `fleet`.
 */
const txClients = new AsyncLocalStorage<Map<DbName, PoolClient>>();

/** Same shape as a better-sqlite3 statement, but every call returns a Promise. */
export class Statement {
  constructor(private readonly db: PgDb, readonly text: string) {}

  async all(...params: unknown[]): Promise<any[]> {
    return await this.db.queryRows(this.text, params);
  }

  /** better-sqlite3 returns undefined when there is no row; pg has no such helper. */
  async get(...params: unknown[]): Promise<any | undefined> {
    return await this.db.queryRow(this.text, params);
  }

  async run(...params: unknown[]): Promise<{ changes: number }> {
    return await this.db.queryRun(this.text, params);
  }
}

export class PgDb {
  constructor(readonly name: DbName, private readonly pool: Pool) {}

  prepare(sql: string): Statement {
    return new Statement(this, toPgPlaceholders(sql));
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  /** Multi-statement DDL. Cannot take parameters (pg only allows that in the extended protocol). */
  async exec(sql: string): Promise<void> {
    const pinned = await txClients.getStore()?.get(this.name);
    if (pinned) await pinned.query(sql);
    else await this.pool.query(sql);
  }

  async queryRows(text: string, params: unknown[]): Promise<any[]> {
    const pinned = await txClients.getStore()?.get(this.name);
    const res = pinned ? await pinned.query(text, params) : await this.pool.query(text, params);
    return res.rows;
  }

  async queryRow(text: string, params: unknown[]): Promise<any | undefined> {
    const rows = await this.queryRows(text, params);
    return rows[0];
  }

  async queryRun(text: string, params: unknown[]): Promise<{ changes: number }> {
    const pinned = await txClients.getStore()?.get(this.name);
    const res = pinned ? await pinned.query(text, params) : await this.pool.query(text, params);
    return { changes: res.rowCount ?? 0 };
  }

  /**
   * `db.transaction(fn)` from better-sqlite3, made async.
   *
   * Every statement the callback issues through *this* schema is forced onto
   * one connection (see txClients), and a nested transaction on the same
   * schema reuses the open one instead of deadlocking or opening a second.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const store = txClients.getStore() ?? new Map<DbName, PoolClient>();
    const alreadyOpen = await store.get(this.name);
    if (alreadyOpen) return fn();

    const client = await this.pool.connect();
    store.set(this.name, client);
    try {
      await client.query('BEGIN');
      const out = await txClients.run(store, fn);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      store.delete(this.name);
      client.release();
    }
  }
}
