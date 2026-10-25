import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { writeAudit } from '../../common/audit/audit';

@Injectable()
export class PaymentsService {
  private pdb() { return getDb('payment'); }

  async getSettingInt(key: string): Promise<number> {
    const row = await this.pdb().prepare(`SELECT value_int FROM platform_settings WHERE key = ?`).get(key) as any;
    return row ? row.value_int : 0;
  }

  async listSettings() {
    return await this.pdb().prepare(`SELECT * FROM platform_settings ORDER BY key`).all();
  }

  async setSetting(actorId: string, key: string, valueInt: number) {
    // Renter fees are gone by design: renters use CAR-ENT for free.
    const allowed = ['owner_subscription_monthly_paise', 'partial_payment_percent', 'deposit_refund_hours'];
    if (!allowed.includes(key)) throw new BadRequestException(`Unknown setting: ${key}`);
    const before = await this.pdb().prepare(`SELECT * FROM platform_settings WHERE key = ?`).get(key);
    await this.pdb().prepare(`UPDATE platform_settings SET value_int = ?, updated_by = ?, updated_at = ? WHERE key = ?`)
      .run(valueInt, actorId, nowUtc(), key);
    // every change logged (5.5 Task 2.1 rule)
    writeAudit('payment', { actor_id: actorId, action: 'setting.updated', entity_type: 'platform_setting', entity_id: key, before_value: before, after_value: { value_int: valueInt } });
    return { message: `${key} = ${valueInt}` };
  }

  async ensureWallet(userId: string) {
    const db = this.pdb();
    let w = await db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId) as any;
    if (!w) {
      await db.prepare(`INSERT INTO wallets (id, user_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)`)
        .run(uuid(), userId, nowUtc(), nowUtc(), userId);
      w = await db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId);
    }
    return w;
  }

  async walletFor(userId: string) {
    return await this.ensureWallet(userId);
  }

  async addTransaction(tx: {
    booking_id?: string | null; payer_id: string; payee_id?: string | null; amount_paise: number;
    type: string; method?: string; status: string; note?: string; actor: string;
  }) {
    const id = uuid();
    await this.pdb().prepare(
      `INSERT INTO transactions (id, booking_id, payer_id, payee_id, amount_paise, type, method, status, note, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, tx.booking_id ?? null, tx.payer_id, tx.payee_id ?? null, tx.amount_paise,
      tx.type, tx.method ?? 'online', tx.status, tx.note ?? null, nowUtc(), nowUtc(), tx.actor);
    return id;
  }

  async createInvoice(kind: string, bookingId: string | null, amountPaise: number, actor: string) {
    const id = uuid();
    const number = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await this.pdb().prepare(
      `INSERT INTO invoices (id, booking_id, number, amount_paise, kind, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, bookingId, number, amountPaise, kind, nowUtc(), nowUtc(), actor);
    return { id, number };
  }

  /** Called when the renter pays online after owner approval: captures partial % + deposit hold */
  async captureBookingPartial(booking: any, actor: string) {
    const percent = await this.getSettingInt('partial_payment_percent');
    const onlineRental = Math.round((booking.total_amount_paise * percent) / 100);
    const deposit = booking.security_deposit_paise || 0;
    const ids: string[] = [];
    if (onlineRental > 0) {
      ids.push(await this.addTransaction({
        booking_id: booking.id, payer_id: booking.renter_id, payee_id: booking.owner_id,
        amount_paise: onlineRental, type: 'booking_partial', status: 'held', note: `${percent}% partial held`, actor,
      }));
    }
    if (deposit > 0) {
      ids.push(await this.addTransaction({
        booking_id: booking.id, payer_id: booking.renter_id, payee_id: null,
        amount_paise: deposit, type: 'deposit_hold', status: 'held', note: 'Security deposit held', actor,
      }));
    }
    const invoice = await this.createInvoice('booking_partial', booking.id, onlineRental + deposit, actor);
    return {
      online_charged_paise: onlineRental + deposit,
      rental_part_paise: onlineRental,
      deposit_held_paise: deposit,
      invoice_number: invoice.number,
      invoice_id: invoice.id,
    };
  }

  async markPickupCashCollected(booking: any, actor: string) {
    await this.addTransaction({
      booking_id: booking.id, payer_id: booking.renter_id, payee_id: booking.owner_id,
      amount_paise: booking.remaining_due_paise, type: 'pickup_cash', method: 'cash_upi_offline',
      status: 'recorded', note: 'Remaining balance collected in person at pickup', actor,
    });
  }

  /** Move owner's pending -> available after trip completion + dispute window handled lazily */
  async settleOwnerEarnings(booking: any, actor: string) {
    const w = await this.ensureWallet(booking.owner_id);
    const percent = await this.getSettingInt('partial_payment_percent');
    const onlineRental = Math.round((booking.total_amount_paise * percent) / 100);
    const lateFee = booking.late_fee_paise || 0;
    const amount = onlineRental + lateFee;
    await this.pdb().prepare(`UPDATE wallets SET pending_balance_paise = GREATEST(pending_balance_paise - ?, 0), available_balance_paise = available_balance_paise + ?, updated_at = ? WHERE id = ?`)
      .run(amount, amount, nowUtc(), w.id);
    await this.pdb().prepare(`UPDATE transactions SET status = 'settled', updated_at = ? WHERE booking_id = ? AND type IN ('booking_partial','late_fee') AND status = 'held'`)
      .run(nowUtc(), booking.id);
    writeAudit('payment', {
      actor_id: actor, action: 'wallet.settled', entity_type: 'wallet', entity_id: w.id,
      before_value: { pending: w.pending_balance_paise }, after_value: { credited: amount },
    });
    return amount;
  }

  async refundDeposit(booking: any, reason: string, actor: string) {
    if (booking.security_deposit_paise <= 0) return 0;
    await this.addTransaction({
      booking_id: booking.id, payer_id: 'platform', payee_id: booking.renter_id,
      amount_paise: booking.security_deposit_paise, type: 'deposit_refund', status: 'refunded',
      note: reason, actor,
    });
    await this.createRefund(booking.id, 'deposit_refund', booking.security_deposit_paise, reason, actor);
    return booking.security_deposit_paise;
  }

  async refundPartialRental(booking: any, amountPaise: number, reason: string, actor: string) {
    if (amountPaise <= 0) return 0;
    await this.addTransaction({
      booking_id: booking.id, payer_id: 'platform', payee_id: booking.renter_id,
      amount_paise: amountPaise, type: 'refund', status: 'refunded', note: reason, actor,
    });
    await this.createRefund(booking.id, 'refund', amountPaise, reason, actor);
    return amountPaise;
  }

  private async createRefund(bookingId: string, txType: string, amountPaise: number, reason: string, actor: string) {
    const tx = await this.pdb().prepare(
      `SELECT id FROM transactions WHERE booking_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(bookingId, txType === 'deposit_refund' ? 'deposit_hold' : 'booking_partial') as any;
    await this.pdb().prepare(
      `INSERT INTO refunds (id, booking_id, transaction_id, amount_paise, reason, status, initiated_by, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'processed', ?, ?, ?, ?)`,
    ).run(uuid(), bookingId, tx?.id ?? 'unknown', amountPaise, reason, actor, nowUtc(), nowUtc(), actor);
  }

  // ---------- Subscriptions ----------
  /** Billing period of the owner membership, in days. */
  private static readonly OWNER_PERIOD_DAYS = 30;

  /**
   * One month of owner membership, paid up front.
   *
   * A paying member keeps a single subscription row whose `period_end` is the
   * truth about how long they are covered; every payment extends that date
   * instead of stacking rows, so "active until" never has to be reconciled
   * across duplicates. Each payment is still its own transaction, which is what
   * the purchases list reads.
   */
  async subscribeOwnerMonthly(actorId: string, ownerId: string) {
    const price = await this.getSettingInt('owner_subscription_monthly_paise');
    if (price <= 0) throw new BadRequestException('Owner membership price is not configured');

    const db = this.pdb();
    const current = await db.prepare(
      `SELECT * FROM subscriptions WHERE user_id = ? AND plan = 'car_owner_monthly' AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
    ).get(ownerId) as any;

    const now = new Date();
    // Renewing early extends the cover already paid for; renewing after a lapse
    // starts today rather than back-dating the period.
    const covered = current?.period_end ? new Date(current.period_end) : null;
    const from = covered && covered > now ? covered : now;
    const until = new Date(from.getTime() + PaymentsService.OWNER_PERIOD_DAYS * 24 * 3600 * 1000);

    let id = current?.id as string | undefined;
    if (id) {
      await db.prepare(
        `UPDATE subscriptions SET price_paid_paise = ?, period_end = ?, updated_at = ? WHERE id = ?`,
      ).run(price, until.toISOString(), nowUtc(), id);
    } else {
      id = uuid();
      await db.prepare(
        `INSERT INTO subscriptions (id, user_id, plan, price_paid_paise, period_start, period_end, status, created_at, updated_at, created_by)
         VALUES (?, ?, 'car_owner_monthly', ?, ?, ?, 'active', ?, ?, ?)`,
      ).run(id, ownerId, price, now.toISOString(), until.toISOString(), nowUtc(), nowUtc(), actorId);
    }

    await this.addTransaction({
      payer_id: ownerId, amount_paise: price, type: 'subscription_owner', status: 'captured',
      note: `Owner membership — ${PaymentsService.OWNER_PERIOD_DAYS} days`, actor: actorId,
    });
    const invoice = await this.createInvoice('subscription', null, price, actorId);
    return {
      subscription_id: id,
      price_paid_paise: price,
      period_end: until.toISOString(),
      renewed: !!current,
      invoice_number: invoice.number,
    };
  }

  /**
   * Renters do not pay for anything on CAR-ENT, so the old one-time "lifetime"
   * plan is retired rather than left purchasable. Kept as an explicit refusal
   * so an old client or bookmark gets a clear reason instead of a 404.
   */
  async subscribeRenterLifetime(_actorId: string, _renterId: string): Promise<never> {
    throw new BadRequestException('Renting on CAR-ENT is free — there is no renter membership to buy.');
  }

  /** Plan, cover and payment history for the owner's purchases screen. */
  async ownerPurchases(userId: string) {
    const db = this.pdb();
    const price = await this.getSettingInt('owner_subscription_monthly_paise');
    const sub = await db.prepare(
      `SELECT * FROM subscriptions WHERE user_id = ? AND plan = 'car_owner_monthly' ORDER BY created_at DESC LIMIT 1`,
    ).get(userId) as any;

    const active = !!(sub && sub.status === 'active' && (!sub.period_end || new Date(sub.period_end) > new Date()));
    const purchases = await db.prepare(
      `SELECT id, amount_paise, type, method, status, note, created_at FROM transactions
       WHERE payer_id = ? AND type = 'subscription_owner' ORDER BY created_at DESC LIMIT 100`,
    ).all(userId);
    const totals = await db.prepare(
      `SELECT COALESCE(SUM(amount_paise), 0) AS total, COUNT(*) AS count FROM transactions
       WHERE payer_id = ? AND type = 'subscription_owner' AND status = 'captured'`,
    ).get(userId) as any;

    return {
      plan: {
        key: 'car_owner_monthly',
        label: 'CAR-ENT owner membership',
        amount_paise: price,
        period_days: PaymentsService.OWNER_PERIOD_DAYS,
      },
      subscription: sub || null,
      active,
      purchases,
      total_paid_paise: totals?.total || 0,
      purchase_count: totals?.count || 0,
    };
  }

  async mySubscriptions(userId: string) {
    return await this.pdb().prepare(`SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
  }

  // ---------- Payouts ----------
  async requestPayout(userId: string, amountPaise: number) {
    const w = await this.ensureWallet(userId);
    if (amountPaise <= 0 || amountPaise > w.available_balance_paise) {
      throw new BadRequestException('Amount exceeds available balance');
    }
    const id = uuid();
    await this.pdb().prepare(
      `INSERT INTO payouts (id, user_id, amount_paise, status, requested_by, created_at, updated_at, created_by)
       VALUES (?, ?, ?, 'requested', ?, ?, ?, ?)`,
    ).run(id, userId, amountPaise, userId, nowUtc(), nowUtc(), userId);
    // reserve funds
    await this.pdb().prepare(`UPDATE wallets SET available_balance_paise = available_balance_paise - ?, updated_at = ? WHERE id = ?`)
      .run(amountPaise, nowUtc(), w.id);
    return { payout_id: id, message: 'Payout requested. Super Admin must approve.' };
  }

  async decidePayout(adminId: string, payoutId: string, decision: 'approve' | 'reject', reason?: string) {
    const p = await this.pdb().prepare(`SELECT * FROM payouts WHERE id = ?`).get(payoutId) as any;
    if (!p) throw new NotFoundException('Payout not found');
    if (p.status !== 'requested') throw new BadRequestException(`Payout already ${p.status}`);
    const before = { ...p };
    if (decision === 'approve') {
      await this.pdb().prepare(`UPDATE payouts SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`)
        .run(adminId, nowUtc(), nowUtc(), payoutId);
    } else {
      if (!reason) throw new BadRequestException('Rejection reason mandatory');
      await this.pdb().prepare(`UPDATE payouts SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE id = ?`)
        .run(reason, nowUtc(), payoutId);
      const w = await this.ensureWallet(p.user_id);
      await this.pdb().prepare(`UPDATE wallets SET available_balance_paise = available_balance_paise + ?, updated_at = ? WHERE id = ?`)
        .run(p.amount_paise, nowUtc(), w.id);
    }
    writeAudit('payment', { actor_id: adminId, action: `payout.${decision}d`, entity_type: 'payout', entity_id: payoutId, before_value: before });
    return { message: `Payout ${decision}d` };
  }

  async markPayoutPaid(adminId: string, payoutId: string) {
    const p = await this.pdb().prepare(`SELECT * FROM payouts WHERE id = ?`).get(payoutId) as any;
    if (!p || p.status !== 'approved') throw new BadRequestException('Payout must be approved first');
    await this.pdb().prepare(`UPDATE payouts SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?`).run(nowUtc(), nowUtc(), payoutId);
    return { message: 'Payout marked paid' };
  }

  async earningsFor(userId: string) {
    const w = await this.ensureWallet(userId);
    const payouts = await this.pdb().prepare(`SELECT * FROM payouts WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
    const txs = await this.pdb().prepare(
      `SELECT * FROM transactions WHERE payee_id = ? OR payer_id = ? ORDER BY created_at DESC LIMIT 100`,
    ).all(userId, userId);
    return { wallet: w, payouts, transactions: txs };
  }

  /** Aggregation across DBs happens here in the service layer - never a raw cross-db join */
  async listPayoutsForAdmin(status?: string) {
    const rows = status
      ? await this.pdb().prepare(`SELECT * FROM payouts WHERE status = ? ORDER BY created_at DESC`).all(status)
      : await this.pdb().prepare(`SELECT * FROM payouts ORDER BY created_at DESC`).all();
    const adb = getDb('auth');
    return await Promise.all(rows.map(async (p: any) => {
      const u = await adb.prepare(`SELECT name, email, phone FROM users WHERE id = ?`).get(p.user_id) as any;
      return { ...p, user_name: u?.name, user_email: u?.email, user_phone: u?.phone };
    }));
  }

  async platformRevenue() {
    const subs = await this.pdb().prepare(
      `SELECT COALESCE(SUM(amount_paise),0) AS total FROM transactions WHERE type IN ('subscription_owner','renter_lifetime') AND status = 'captured'`,
    ).get() as any;
    return { subscription_revenue_paise: subs.total };
  }
}
