import { Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';

@Injectable()
export class NotificationsService {
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
}
