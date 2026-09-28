import { getDb, nowUtc } from '../db/database';
import { DbName } from '../db/database';

export interface AuditEntry {
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_value?: unknown;
  after_value?: unknown;
}

export async function writeAudit(dbName: DbName, entry: AuditEntry): Promise<void> {
  const db = getDb(dbName);
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, before_value, after_value, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      require('crypto').randomUUID(),
      entry.actor_id,
      entry.action,
      entry.entity_type,
      entry.entity_id,
      entry.before_value ? JSON.stringify(entry.before_value) : null,
      entry.after_value ? JSON.stringify(entry.after_value) : null,
      nowUtc(),
      nowUtc(),
      entry.actor_id,
    );
}
