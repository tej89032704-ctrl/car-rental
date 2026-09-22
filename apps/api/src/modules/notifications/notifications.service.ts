import { Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';

@Injectable()
export class NotificationsService {
  notify(userId: string, type: string, title: string, body: string, actor = 'system') {
    const db = getDb('notification');
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid(), userId, type, title, body, nowUtc(), nowUtc(), actor);
  }

  sendEmail(to: string, subject: string, body: string, actor = 'system') {
    const db = getDb('notification');
    db.prepare(
      `INSERT INTO email_logs (id, to_address, subject, body, status, sent_at, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, 'sent', ?, ?, ?, ?)`,
    ).run(uuid(), to, subject, body, nowUtc(), nowUtc(), nowUtc(), actor);
  }

  sendSms(toPhone: string, body: string, actor = 'system') {
    const db = getDb('notification');
    db.prepare(
      `INSERT INTO sms_logs (id, to_phone, body, status, sent_at, created_at, updated_at, created_by)
       VALUES (?, ?, ?, 'sent', ?, ?, ?, ?)`,
    ).run(uuid(), toPhone, body, nowUtc(), nowUtc(), nowUtc(), actor);
  }

  listForUser(userId: string) {
    return getDb('notification')
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`)
      .all(userId);
  }
}
