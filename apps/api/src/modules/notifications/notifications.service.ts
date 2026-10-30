import { Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';

export interface EmailResult {
  /** True only when a provider accepted the message. */
  delivered: boolean;
  /** Why delivery failed, safe to log: never contains the API key. */
  error?: string;
}

/**
 * Resend's send endpoint. Plain fetch keeps an SDK out of the dependency tree.
 * RESEND_API_URL overrides it, which is what a delivery test (or a proxy in
 * front of the provider) needs.
 */
const EMAIL_ENDPOINT = (process.env.RESEND_API_URL || 'https://api.resend.com/emails').trim();
const EMAIL_TIMEOUT_MS = 10000;

/**
 * One-time codes and reset tokens must not survive in the email log.
 *
 * `email_logs` is a staff-readable table, so storing the message verbatim puts
 * every live verification code one query away from anyone with database
 * access — which defeats the point of hashing the code in
 * `otp_verifications`. Six-digit runs and long hex tokens are masked on the way
 * into the log; the recipient still gets the real text.
 */
function maskSecrets(text: string): string {
  return text
    .replace(/\b\d{6}\b/g, '••••••')
    .replace(/\b[a-f0-9]{32,}\b/gi, '••••••');
}

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
   * Whether sendEmail() has somewhere to send to. Resend needs both a key and a
   * verified From address; with either missing there is no transport, and the
   * callers that depend on a code arriving say so instead of pretending.
   */
  private emailTransport(): { key: string; from: string } | null {
    const key = (process.env.RESEND_API_KEY || '').trim();
    const from = (process.env.MAIL_FROM || '').trim();
    return key && from ? { key, from } : null;
  }

  get deliversEmail(): boolean {
    return this.emailTransport() !== null;
  }

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

  /**
   * Sends a transactional email and records the attempt either way.
   *
   * The log row is written before the result is returned so the audit trail and
   * the mail agree even if the caller throws; a `failed` row with the provider's
   * status is the only signal an operator gets that mail stopped working, and
   * silently logging `sent` for a message that never left was the previous
   * behaviour.
   */
  async sendEmail(to: string, subject: string, body: string, actor = 'system'): Promise<EmailResult> {
    const transport = this.emailTransport();
    let delivered = false;
    let error: string | undefined;

    if (!transport) {
      error = 'no email transport configured (set RESEND_API_KEY and MAIL_FROM)';
    } else {
      try {
        const res = await fetch(EMAIL_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${transport.key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ from: transport.from, to: [to], subject, text: body }),
          signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
        });
        if (res.ok) {
          delivered = true;
        } else {
          const detail = await res.text().catch(() => '');
          error = `provider responded ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    await getDb('notification')
      .prepare(
        `INSERT INTO email_logs (id, to_address, subject, body, status, sent_at, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uuid(), to, subject, maskSecrets(body), delivered ? 'sent' : 'failed',
        delivered ? nowUtc() : null, nowUtc(), nowUtc(), actor,
      );

    if (error) console.warn(`[mail] ${to}: ${error}`);
    return { delivered, error };
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
