import { Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';

@Injectable()
export class NotificationsService {
  /**
   * Whether sendSms() actually reaches a phone. It does not: no SMS provider is
   * wired up, and the method only records the message in
   * notification.sms_logs. Flows that depend on a code arriving (phone
   * verification) read this and show the code in the app instead, rather than
   * parking the user on a screen no real code can ever unlock. Flip this to
   * true in the same change that gives sendSms a real transport.
   */
  readonly deliversSms = false;

  /**
   * Awaited by every caller on purpose: these inserts must land before the
   * request that triggered them finishes, otherwise a notification (or its
   * audit trail) can be dropped on the floor by a process exit.
   */
  async notify(userId: string, type: string, title: string, body: string, actor = 'system') {
    const db = getDb('notification');
    await db
      .prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(uuid(), userId, type, title, body, nowUtc(), nowUtc(), actor);
  }

  async sendEmail(to: string, subject: string, body: string, actor = 'system') {
    const db = getDb('notification');
    await db
      .prepare(
        `INSERT INTO email_logs (id, to_address, subject, body, status, sent_at, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, 'sent', ?, ?, ?, ?)`,
      )
      .run(uuid(), to, subject, body, nowUtc(), nowUtc(), nowUtc(), actor);
  }

  async sendSms(toPhone: string, body: string, actor = 'system') {
    const db = getDb('notification');
    await db
      .prepare(
        `INSERT INTO sms_logs (id, to_phone, body, status, sent_at, created_at, updated_at, created_by)
         VALUES (?, ?, ?, 'sent', ?, ?, ?, ?)`,
      )
      .run(uuid(), toPhone, body, nowUtc(), nowUtc(), nowUtc(), actor);
  }

  async listForUser(userId: string) {
    return await getDb('notification')
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`)
      .all(userId);
  }

  /**
   * Read receipts.
   *
   * Scoped by user_id as well as id: a receipt for someone else's
   * notification must be a no-op, not a silent success that reveals the id
   * exists. The column is `read_at` (a timestamp), which is what the portal
   * checks — there is no boolean `read`.
   */
  async markRead(userId: string, id: string) {
    await getDb('notification')
      .prepare(`UPDATE notifications SET read_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL`)
      .run(nowUtc(), nowUtc(), id, userId);
    return { message: 'Marked read' };
  }

  async markAllRead(userId: string) {
    await getDb('notification')
      .prepare(`UPDATE notifications SET read_at = ?, updated_at = ? WHERE user_id = ? AND read_at IS NULL`)
      .run(nowUtc(), nowUtc(), userId);
    return { message: 'All caught up' };
  }
}
