import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { writeAudit } from '../../common/audit/audit';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';

const extensionSchema = z.object({ new_end_date: z.string() });
const reviewSchema = z.object({
  booking_id: z.string(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
const disputeSchema = z.object({ booking_id: z.string(), reason: z.string().min(5) });

@Injectable()
export class BookingsService {
  constructor(
    private payments: PaymentsService,
    private notifier: NotificationsService,
  ) {}

  private db() { return getDb('booking'); }

  private pdb() { return getDb('payment'); }

  // ---------- Helpers ----------
  private async b(id: string): Promise<any> {
    const row = await this.db().prepare(`SELECT * FROM bookings WHERE id = ?`).get(id) as any;
    if (!row) throw new NotFoundException(`Booking ${id} not found`);
    return row;
  }

  private async bRaw(id: string): Promise<any> {
    return await this.db().prepare(`SELECT * FROM bookings WHERE id = ?`).get(id);
  }

  private row2b(r: any) {
    return {
      id: r.id,
      car_id: r.car_id,
      renter_id: r.renter_id,
      owner_id: r.owner_id,
      start_date: r.start_date,
      end_date: r.end_date,
      status: r.status,
      total_amount_paise: r.total_amount_paise,
      online_paid_paise: r.online_paid_paise,
      remaining_due_paise: r.remaining_due_paise,
      security_deposit_paise: r.security_deposit_paise,
      late_fee_paise: r.late_fee_paise,
      completed_at: r.completed_at,
      cancelled_at: r.cancelled_at,
      is_deleted: r.is_deleted,
      created_at: r.created_at,
      updated_at: r.updated_at,
      created_by: r.created_by,
    };
  }

  // ---------- Renter: create booking request ----------
  async createRequest(renterId: string, body: { car_id: string; start_date: string; end_date: string }) {
    let car = await this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(body.car_id) as any;
    if (!car) {
      // cache may be stale (e.g. fresh boot before sync) — pull from fleet and cache it
      const fleetRow = await getDb('fleet').prepare(
        `SELECT c.id, c.owner_id, c.make, c.model, c.plate_number, c.category, c.status,
                p.daily_rate_paise, p.security_deposit_paise
         FROM cars c LEFT JOIN car_pricing p ON p.car_id = c.id
         WHERE c.id = ?`, 
      ).get(body.car_id) as any;
      if (!fleetRow) throw new NotFoundException(`Car ${body.car_id} not found`);
      await this.db().prepare(
        `INSERT INTO car_cache (id, brand, model, plate, category, price_paise_per_day, security_deposit_paise, image_url, owner_id, status, is_available, is_deleted, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, 0, ?)`,
      ).run(fleetRow.id, fleetRow.make, fleetRow.model, fleetRow.plate_number, fleetRow.category,
        fleetRow.daily_rate_paise || 0, fleetRow.security_deposit_paise || 0, fleetRow.owner_id, fleetRow.status, nowUtc());
      car = await this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(body.car_id);
    }
    if (!car) throw new NotFoundException(`Car ${body.car_id} not found`);
    if (car.status !== 'active') throw new BadRequestException('Only active cars can be booked');
    if (car.is_deleted) throw new BadRequestException('Car is deleted');

    // Accept either 'YYYY-MM-DD' or a full ISO datetime; normalize to a UTC day string
    // so downstream consumers (cancel/extension/sweep) can rely on date-only values.
    const toUtcDay = (s: string) => {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date: ${s}`);
      return d.toISOString().slice(0, 10);
    };
    const startDay = toUtcDay(body.start_date);
    const endDay = toUtcDay(body.end_date);
    const start = new Date(`${startDay}T00:00:00Z`);
    const end = new Date(`${endDay}T00:00:00Z`);
    if (end <= start) throw new BadRequestException('end_date must be after start_date');
    const days = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (days < 1) throw new BadRequestException('Minimum 1 day');
    const total = days * car.price_paise_per_day;
    const now = nowUtc();

    const id = uuid();
    await this.db().prepare(`INSERT INTO bookings (id, car_id, renter_id, owner_id, start_date, end_date, status, total_amount_paise, online_paid_paise, remaining_due_paise, security_deposit_paise, late_fee_paise, completed_at, cancelled_at, is_deleted, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, 0, ?, ?, 0, NULL, NULL, 0, ?, ?, ?)`)
      .run(id, body.car_id, renterId, car.owner_id, startDay, endDay, total, total,
        car.security_deposit_paise || 0, now, now, renterId);

    writeAudit('booking', {
      actor_id: renterId, action: 'booking.requested', entity_type: 'booking',
      entity_id: id, after_value: { car_id: body.car_id, start_date: body.start_date, end_date: body.end_date, total_amount_paise: total },
    });

    await this.db().prepare(`UPDATE car_cache SET is_available = 0 WHERE id = ?`).run(body.car_id);

    const renter = await getDb('auth').prepare(`SELECT name FROM users WHERE id = ?`).get(renterId) as any;
    await this.notifier.notify(car.owner_id, 'booking', 'New booking request',
      `${renter?.name ?? 'A renter'} requested ${car.brand} ${car.model} (${body.start_date} → ${body.end_date})`, renterId);

    return { id, status: 'requested', total_amount_paise: total, car: { id: car.id, brand: car.brand, model: car.model, plate: car.plate, price_paise_per_day: car.price_paise_per_day, image_url: car.image_url } };
  }

  // ---------- Renter / Owner: my bookings ----------
  async myBookings(userId: string, role: string): Promise<any[]> {
    const stmt = role === 'car_renter'
      ? `SELECT * FROM bookings WHERE renter_id = ? AND is_deleted = 0 ORDER BY created_at DESC`
      : `SELECT * FROM bookings WHERE owner_id = ? AND is_deleted = 0 ORDER BY created_at DESC`;
    return await Promise.all((await this.db().prepare(stmt).all(userId)).map(async (r: any) => {
      const car = await this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(r.car_id) as any;
      const owner = await getDb('auth').prepare(`SELECT id, name FROM users WHERE id = ?`).get(r.owner_id) as any;
      const out: any = {
        ...this.row2b(r),
        car: car ? { id: car.id, brand: car.brand, model: car.model, plate: car.plate, category: car.category, price_paise_per_day: car.price_paise_per_day, image_url: car.image_url } : null,
        owner: owner ? { id: owner.id, name: owner.name } : null,
      };
      const review = await this.db().prepare(`SELECT id FROM reviews WHERE booking_id = ? AND reviewer_id = ? AND is_deleted = 0`).get(r.id, userId);
      if (review) out.has_reviewed = true;
      return out;
    }));
  }

  // ---------- Renter: cancel ----------
  async cancelByRenter(renterId: string, id: string, reason?: string) {
    const b = await this.b(id);
    if (b.status !== 'requested' && b.status !== 'confirmed' && b.status !== 'ongoing') throw new BadRequestException(`Cannot cancel booking in status ${b.status}`);
    if (b.renter_id !== renterId) throw new BadRequestException('Not your booking');

    const now = nowUtc();

    await this.db().prepare(`UPDATE bookings SET status = 'cancelled', cancelled_at = ?, updated_at = ?, remaining_due_paise = 0 WHERE id = ?`)
      .run(now, now, id);
    await this.db().prepare(`UPDATE car_cache SET is_available = 1 WHERE id = ?`).run(b.car_id);

    const startDate = new Date(b.start_date + 'T00:00:00Z');
    const daysUntilStart = Math.max(0, Math.round((startDate.getTime() - Date.now()) / 86400000));

    // Spec 6.3 refund tiers — nominal refund/penalty against the trip total.
    let tier: string, tierRefund: number, tierPenalty: number;
    if (b.status === 'requested') {
      tier = 'free'; tierRefund = b.total_amount_paise; tierPenalty = 0;
    } else if (b.status === 'ongoing') {
      // Trip already started: full penalty (Spec 6.3 no_refund tier)
      tier = 'no_refund'; tierRefund = 0; tierPenalty = b.total_amount_paise;
    } else if (daysUntilStart >= 1) {
      // Spec 6.3: free cancellation >= 24h before start
      tier = 'free'; tierRefund = b.total_amount_paise; tierPenalty = 0;
    } else {
      // Spec 6.3: 50% within 24h of start
      tier = 'partial_50'; tierRefund = Math.floor(b.total_amount_paise / 2); tierPenalty = b.total_amount_paise - tierRefund;
    }

    // Only cash the renter actually put in can come back. The tier penalty is
    // enforced against the captured advance first; the rest of the advance is
    // refunded, and the security deposit is released in full (no trip happened).
    const rentCaptured = b.online_paid_paise || 0;
    const rentRetained = Math.min(rentCaptured, tierPenalty);
    const rentRefund = rentCaptured - rentRetained;

    if (rentRefund > 0) {
      // refunds are recorded in the payments ledger (payment.db), never in booking.db
      await this.payments.refundPartialRental(b, rentRefund, `Cancellation (${tier})`, renterId);
    }

    // Release the deposit hold the same way completed trips do (mirrors the sweep
    // guard, so the post-completion sweep can never double-release once cancelled).
    if ((b.security_deposit_paise || 0) > 0 && rentCaptured > 0) {
      const held = await this.pdb().prepare(`SELECT id FROM transactions WHERE booking_id = ? AND type = 'deposit_hold'`).get(id);
      const released = await this.pdb().prepare(`SELECT id FROM transactions WHERE booking_id = ? AND type = 'deposit_refund'`).get(id);
      if (held && !released) {
        await this.payments.refundDeposit(b, `Deposit released on cancellation (${tier})`, renterId);
      }
    }

    await this.db().prepare(`INSERT INTO cancellations (id, booking_id, cancelled_by, tier, refund_amount_paise, penalty_amount_paise, reason, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uuid(), id, renterId, tier, rentRefund, rentRetained, reason || null, now, now, renterId);

    writeAudit('booking', {
      actor_id: renterId, action: 'booking.cancelled', entity_type: 'booking', entity_id: id,
      after_value: {
        tier,
        tier_refund_amount_paise: tierRefund, tier_penalty_amount_paise: tierPenalty,
        refund_amount_paise: rentRefund, penalty_amount_paise: rentRetained,
        deposit_refunded_paise: (b.security_deposit_paise || 0) > 0 && rentCaptured > 0 ? b.security_deposit_paise : 0,
      },
    });
    return { message: `Cancelled (${tier})`, refund_amount_paise: rentRefund, penalty_amount_paise: rentRetained };
  }

  // ---------- Renter: pay online (20% partial after owner approval) ----------
  async payOnline(renterId: string, id: string) {
    const b = await this.b(id);
    if (b.renter_id !== renterId) throw new BadRequestException('Not your booking');
    if (b.status !== 'confirmed') throw new BadRequestException('Online payment is only available after the owner confirms the booking');
    if (b.online_paid_paise > 0) throw new BadRequestException('Online payment already made for this booking');

    const res = await this.payments.captureBookingPartial(b, renterId);
    const onlinePaid = res.rental_part_paise;
    const remaining = b.total_amount_paise - onlinePaid;
    const now = nowUtc();

    await this.db().prepare(`UPDATE bookings SET online_paid_paise = ?, remaining_due_paise = ?, updated_at = ? WHERE id = ?`)
      .run(onlinePaid, remaining, now, id);

    writeAudit('booking', { actor_id: renterId, action: 'booking.paid_online', entity_type: 'booking', entity_id: id, after_value: { online_paid_paise: onlinePaid, remaining_due_paise: remaining, deposit_held_paise: res.deposit_held_paise, invoice_number: res.invoice_number } });
    await this.notifier.notify(b.owner_id, 'payment', 'Online payment received',
      `Renter paid ₹${(onlinePaid / 100).toFixed(0)} online for the confirmed booking.`, renterId);

    return {
      message: 'Payment successful',
      booking_id: id,
      online_paid_paise: onlinePaid,
      remaining_due_paise: remaining,
      deposit_held_paise: res.deposit_held_paise,
      invoice_number: res.invoice_number,
    };
  }

  // ---------- Renter: request extension ----------
  async requestExtension(renterId: string, id: string, newEnd: string) {
    const b = await this.b(id);
    if (b.status !== 'confirmed' && b.status !== 'ongoing') throw new BadRequestException('Can only extend confirmed/ongoing bookings');
    if (b.renter_id !== renterId) throw new BadRequestException('Not your booking');
    if (b.is_deleted) throw new BadRequestException('Booking deleted');

    const oldEnd = new Date(b.end_date + 'T00:00:00Z');
    const newEndD = new Date(newEnd);
    if (Number.isNaN(newEndD.getTime())) throw new BadRequestException(`Invalid date: ${newEnd}`);
    const newEndDay = newEndD.toISOString().slice(0, 10);
    const newEndDayD = new Date(`${newEndDay}T00:00:00Z`);
    const additionalDays = Math.round((newEndDayD.getTime() - oldEnd.getTime()) / 86400000);
    if (additionalDays < 1) throw new BadRequestException('Minimum 1 additional day');
    if (newEndDayD < oldEnd) throw new BadRequestException('new_end_date must be after current end_date');

    const car = await this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(b.car_id) as any;
    const additionalAmount = additionalDays * car.price_paise_per_day;

    const extId = uuid();
    await this.db().prepare(`INSERT INTO trip_extensions (id, booking_id, requested_end_date, additional_days, additional_amount_paise, status, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
      .run(extId, id, newEndDay, additionalDays, additionalAmount, nowUtc(), nowUtc(), renterId);

    writeAudit('booking', { actor_id: renterId, action: 'extension.requested', entity_type: 'trip_extension', entity_id: extId, after_value: { booking_id: id, new_end_date: newEnd, additional_days: additionalDays, additional_amount_paise: additionalAmount } });
    return {
      id: extId,
      extension_id: extId,
      status: 'pending',
      additional_days: additionalDays,
      additional_amount_paise: additionalAmount,
      requested_end_date: newEndDay,
    };
  }

  // ---------- Owner: booking requests ----------
  async bookingRequestsForOwner(ownerId: string): Promise<any[]> {
    // requested + confirmed + ongoing: the Requests page also hosts Start Trip /
    // Complete actions, so approved and in-progress trips must stay visible here.
    const rows = await this.db().prepare(`SELECT * FROM bookings WHERE owner_id = ? AND status IN ('requested','confirmed','ongoing') AND is_deleted = 0 ORDER BY created_at DESC`).all(ownerId) as any[];
    return await Promise.all(rows.map(async (r: any) => ({
      ...this.row2b(r),
      renter: await this.renterProfile(r.renter_id),
    })));
  }

  /** Requesting renter's name + the rating/comments other owners left for them. */
  private async renterProfile(renterId: string) {
    const u = await getDb('auth').prepare(`SELECT id, name FROM users WHERE id = ?`).get(renterId) as any;
    const stats = await this.db().prepare(`
      SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avg_rating
      FROM reviews WHERE target_type = 'renter' AND target_user_id = ? AND is_deleted = 0
    `).get(renterId) as any;
    const rows = await this.db().prepare(`
      SELECT reviewer_id, rating, comment, created_at FROM reviews
      WHERE target_type = 'renter' AND target_user_id = ? AND is_deleted = 0 AND comment IS NOT NULL
      ORDER BY created_at DESC LIMIT 3
    `).all(renterId) as any[];
    const adb = getDb('auth');
    const recent_comments = await Promise.all(rows.map(async (r: any) => ({
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      reviewer_name: (await adb.prepare(`SELECT name FROM users WHERE id = ?`).get(r.reviewer_id) as any)?.name ?? 'Owner',
    })));
    return {
      id: renterId,
      name: u?.name ?? 'Renter',
      avg_rating: Math.round((stats.avg_rating || 0) * 10) / 10,
      total_reviews: stats.count,
      recent_comments,
    };
  }

  // ---------- Owner: completed bookings ----------
  async completedBookingsForOwner(ownerId: string): Promise<any[]> {
    return await Promise.all((await this.db().prepare(`SELECT * FROM bookings WHERE owner_id = ? AND status = 'completed' AND is_deleted = 0 ORDER BY completed_at DESC`).all(ownerId)).map(async (r: any) => {
      const car = await this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(r.car_id) as any;
      const review = await this.db().prepare(`SELECT * FROM reviews WHERE booking_id = ? AND reviewer_id = ? AND is_deleted = 0`).get(r.id, ownerId) as any;
      return {
        ...this.row2b(r),
        car: car ? { id: car.id, brand: car.brand, model: car.model, plate: car.plate } : null,
        renter: await this.renterProfile(r.renter_id),
        has_reviewed: !!review,
      };
    }));
  }

  // ---------- Owner: decide (approve/reject) ----------
  async ownerDecide(ownerId: string, id: string, decision: 'approve' | 'reject') {
    const b = await this.b(id);
    if (b.status !== 'requested') throw new BadRequestException('Only requested bookings can be decided');
    if (b.owner_id !== ownerId) throw new BadRequestException('Not your car');
    if (b.is_deleted) throw new BadRequestException('Booking deleted');

    if (decision === 'reject') {
      await this.db().prepare(`UPDATE bookings SET status = 'rejected', updated_at = ? WHERE id = ?`).run(nowUtc(), id);
      await this.db().prepare(`UPDATE car_cache SET is_available = 1 WHERE id = ?`).run(b.car_id);
      writeAudit('booking', { actor_id: ownerId, action: 'booking.rejected', entity_type: 'booking', entity_id: id });
      return { message: 'Rejected' };
    }

    await this.db().prepare(`UPDATE bookings SET status = 'confirmed', updated_at = ? WHERE id = ?`).run(nowUtc(), id);
    writeAudit('booking', { actor_id: ownerId, action: 'booking.approved', entity_type: 'booking', entity_id: id });
    const car = await this.db().prepare(`SELECT brand, model FROM car_cache WHERE id = ?`).get(b.car_id) as any;
    await this.notifier.notify(b.renter_id, 'booking', 'Booking approved!',
      `Your booking for ${car?.brand} ${car?.model} was approved. Pay 20% online in My Bookings to confirm.`, ownerId);
    return { message: 'Approved', status: 'confirmed' };
  }

  // ---------- Owner: start trip (cash pickup) ----------
  async startTripWithCashRecorded(ownerId: string, id: string) {
    const b = await this.b(id);
    if (b.status !== 'confirmed') throw new BadRequestException('Booking must be confirmed first');
    if (b.owner_id !== ownerId) throw new BadRequestException('Not your car');

    await this.db().prepare(`UPDATE bookings SET status = 'ongoing', updated_at = ? WHERE id = ?`).run(nowUtc(), id);
    if ((b.remaining_due_paise) > 0) {
      await this.payments.markPickupCashCollected(b, ownerId);
      // cash/UPI was handed over at pickup -> nothing left due at the platform
      await this.db().prepare(`UPDATE bookings SET remaining_due_paise = 0, updated_at = ? WHERE id = ?`).run(nowUtc(), id);
    }
    writeAudit('booking', { actor_id: ownerId, action: 'trip.started', entity_type: 'booking', entity_id: id, after_value: { remaining_due_collected: b.remaining_due_paise } });
    await this.notifier.notify(b.renter_id, 'trip', 'Trip started', 'Your trip has started. Drive safe!', ownerId);
    return { message: 'Trip started' };
  }

  // ---------- Owner: complete trip ----------
  async completeTrip(ownerId: string, id: string) {
    const b = await this.b(id);
    if (b.status !== 'ongoing') throw new BadRequestException('Only ongoing trips can be completed');
    if (b.owner_id !== ownerId) throw new BadRequestException('Not your car');

    const now = nowUtc();
    await this.db().prepare(`UPDATE bookings SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);
    await this.db().prepare(`UPDATE car_cache SET is_available = 1 WHERE id = ?`).run(b.car_id);
    if (b.online_paid_paise > 0) {
      await this.payments.settleOwnerEarnings(b, ownerId);
    }
    writeAudit('booking', { actor_id: ownerId, action: 'trip.completed', entity_type: 'booking', entity_id: id });
    await this.notifier.notify(b.renter_id, 'trip', 'Trip completed', 'Your trip is complete. Thanks for driving with CAR-ENT!', ownerId);
    return { message: 'Trip completed', late_fee_paise: b.late_fee_paise ?? 0 };
  }

  // ---------- Owner: decide extension ----------
  async decideExtension(ownerId: string, id: string, decision: 'approve' | 'reject') {
    const ext = await this.db().prepare(`SELECT * FROM trip_extensions WHERE id = ?`).get(id) as any;
    if (!ext) throw new NotFoundException(`Extension ${id} not found`);
    const b = await this.b(ext.booking_id);
    if (b.owner_id !== ownerId) throw new BadRequestException('Not your car');

    const now = nowUtc();
    if (decision === 'approve') {
      await this.db().prepare(`UPDATE trip_extensions SET status = 'approved', decided_by = ?, updated_at = ? WHERE id = ?`).run(ownerId, now, id);
      await this.db().prepare(`UPDATE bookings SET end_date = ?, remaining_due_paise = remaining_due_paise + ?, updated_at = ? WHERE id = ?`)
        .run(ext.requested_end_date, ext.additional_amount_paise, now, ext.booking_id);
      writeAudit('booking', { actor_id: ownerId, action: 'extension.approved', entity_type: 'trip_extension', entity_id: id, after_value: { booking_id: ext.booking_id, new_end_date: ext.requested_end_date } });
      return { message: 'Extension approved', status: 'approved' };
    }

    await this.db().prepare(`UPDATE trip_extensions SET status = 'rejected', decided_by = ?, updated_at = ? WHERE id = ?`).run(ownerId, now, id);
    writeAudit('booking', { actor_id: ownerId, action: 'extension.rejected', entity_type: 'trip_extension', entity_id: id });
    return { message: 'Extension rejected', status: 'rejected' };
  }

  // ---------- Both: reviews ----------
  async leaveReview(userId: string, role: string, data: { booking_id: string; rating: number; comment?: string }) {
    const b = await this.b(data.booking_id);
    if (b.status !== 'completed') throw new BadRequestException('Can only review completed trips');
    if (b.is_deleted) throw new BadRequestException('Booking deleted');

    const existing = await this.db().prepare(`SELECT id FROM reviews WHERE booking_id = ? AND reviewer_id = ? AND is_deleted = 0`).get(data.booking_id, userId);
    if (existing) throw new BadRequestException('Already reviewed this booking');

    // One renter submission rates both targets: the car (what future renters see
    // while booking) and the owner. The owner's submission rates the renter — so
    // both sides rate each other and the car's rating comes from real trips.
    const targets: { type: 'car' | 'owner' | 'renter'; id: string }[] =
      role === 'car_renter'
        ? [{ type: 'car', id: b.car_id }, { type: 'owner', id: b.owner_id }]
        : [{ type: 'renter', id: b.renter_id }];

    const now = nowUtc();
    let firstId = '';
    for (const t of targets) {
      const id = uuid();
      if (!firstId) firstId = id;
      await this.db().prepare(`INSERT INTO reviews (id, booking_id, reviewer_id, target_type, target_user_id, rating, comment, is_deleted, created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
        .run(id, data.booking_id, userId, t.type, t.id, data.rating, data.comment || null, now, now, userId);
    }

    writeAudit('booking', {
      actor_id: userId, action: 'review.created', entity_type: 'review', entity_id: firstId,
      after_value: { booking_id: data.booking_id, rating: data.rating, targets: targets.map((t) => t.type) },
    });
    return { id: firstId, rating: data.rating, comment: data.comment || null, targets: targets.map((t) => t.type) };
  }

  // ---------- Both: disputes ----------
  async raiseDispute(raisedBy: string, data: { booking_id: string; reason: string }) {
    const b = await this.b(data.booking_id);
    if (b.status !== 'completed' && b.status !== 'requested') throw new BadRequestException('Can only dispute requested or completed bookings');
    if (b.is_deleted) throw new BadRequestException('Booking deleted');
    if (b.renter_id !== raisedBy && b.owner_id !== raisedBy) throw new BadRequestException('Not a participant');

    const id = uuid();
    await this.db().prepare(`INSERT INTO disputes (id, booking_id, raised_by, against_user_id, reason, status, is_deleted, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, 'open', 0, ?, ?, ?)`)
      .run(id, data.booking_id, raisedBy, raisedBy === b.renter_id ? b.owner_id : b.renter_id, data.reason, nowUtc(), nowUtc(), raisedBy);

    writeAudit('booking', { actor_id: raisedBy, action: 'dispute.raised', entity_type: 'dispute', entity_id: id, after_value: { booking_id: data.booking_id, reason: data.reason } });
    return { id, status: 'open' };
  }

  // ---------- Owner: pending extensions ----------
  async pendingExtensionsForOwner(ownerId: string): Promise<any[]> {
    const exts = await this.db().prepare(`
      SELECT te.*, b.car_id, b.renter_id, b.start_date, b.end_date,
             c.brand, c.model, c.plate
      FROM trip_extensions te
      JOIN bookings b ON b.id = te.booking_id
      JOIN car_cache c ON c.id = b.car_id
      WHERE b.owner_id = ? AND te.status = 'pending' AND b.is_deleted = 0
      ORDER BY te.created_at DESC
    `).all(ownerId) as any[];
    return exts.map((r: any) => ({
      id: r.id,
      booking_id: r.booking_id,
      renter_id: r.renter_id,
      car: { id: r.car_id, brand: r.brand, model: r.model, plate: r.plate },
      requested_end_date: r.requested_end_date,
      additional_days: r.additional_days,
      additional_amount_paise: r.additional_amount_paise,
      status: r.status,
      created_at: r.created_at,
    }));
  }

  // ---------- Dispute resolution (admin) ----------
  async resolveDispute(adminId: string, disputeId: string, data: { resolution_note: string; refund_amount_paise?: number; penalty_amount_paise?: number }) {
    const d = await this.db().prepare(`SELECT * FROM disputes WHERE id = ?`).get(disputeId) as any;
    if (!d) throw new NotFoundException(`Dispute ${disputeId} not found`);
    if (d.status !== 'open') throw new BadRequestException('Dispute already resolved');

    await this.db().prepare(`UPDATE disputes SET status = 'resolved', resolution_note = ?, resolved_by = ?, resolved_at = ?, refund_amount_paise = COALESCE(?, refund_amount_paise), penalty_amount_paise = COALESCE(?, penalty_amount_paise), updated_at = ? WHERE id = ?`)
      .run(data.resolution_note, adminId, nowUtc(), data.refund_amount_paise, data.penalty_amount_paise, nowUtc(), disputeId);

    writeAudit('booking', { actor_id: adminId, action: 'dispute.resolved', entity_type: 'dispute', entity_id: disputeId, after_value: { resolution_note: data.resolution_note } });
    return { message: 'Dispute resolved' };
  }

  // ---------- Disputes list (admin) ----------
  async listDisputes(): Promise<any[]> {
    return await (await this.db().prepare(`SELECT * FROM disputes WHERE status = 'open' AND is_deleted = 0 ORDER BY created_at DESC`).all()).map((r: any) => ({
      id: r.id,
      booking_id: r.booking_id,
      raised_by: r.raised_by,
      against_user_id: r.against_user_id,
      reason: r.reason,
      status: r.status,
      created_at: r.created_at,
    }));
  }

  // ---------- Admin: sweep settlements (lazy pass) ----------
  /**
   * After the dispute window (deposit_refund_hours setting, default 24h) elapses from
   * completed_at, auto-refunds the security deposit for completed trips that have no
   * open dispute and no existing deposit refund. Ledger writes happen in payment.db.
   */
  async sweepSettlements(): Promise<{ swept: number }> {
    const hours = await this.payments.getSettingInt('deposit_refund_hours') || 24;
    const cutoff = Date.now() - hours * 3600000;
    const rows = await this.db().prepare(
      `SELECT * FROM bookings WHERE status = 'completed' AND is_deleted = 0 AND completed_at IS NOT NULL AND security_deposit_paise > 0`,
    ).all() as any[];
    let swept = 0;
    for (const b of rows) {
      const completedAt = String(b.completed_at).trim();
      // SQLite datetime() writes 'YYYY-MM-DD HH:MM:SS' (UTC); normalize to ISO before parsing
      const iso = completedAt.includes('T') ? completedAt
        : `${completedAt.replace(' ', 'T')}Z`;
      const ms = Date.parse(iso);
      if (Number.isNaN(ms) || ms > cutoff) continue;
      const openDispute = await this.db().prepare(`SELECT id FROM disputes WHERE booking_id = ? AND status = 'open' AND is_deleted = 0`).get(b.id);
      const already = await this.pdb().prepare(`SELECT id FROM transactions WHERE booking_id = ? AND type = 'deposit_refund'`).get(b.id);
      if (openDispute || already) continue;
      await this.payments.refundDeposit(b, `Auto refund after dispute window (${hours}h)`, 'system');
      swept++;
    }
    return { swept };
  }

  // ---------- Admin: platform stats ----------
  async platformStats(): Promise<{ total_bookings: number; active_bookings: number; completed_bookings: number; cancelled_bookings: number; total_revenue_paise: number }> {
    const db = this.db();
    const total = (await db.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE is_deleted = 0`).get() as any).c;
    const active = (await db.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE status IN ('requested','confirmed','ongoing') AND is_deleted = 0`).get() as any).c;
    const completed = (await db.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE status = 'completed' AND is_deleted = 0`).get() as any).c;
    const cancelled = (await db.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE status = 'cancelled' AND is_deleted = 0`).get() as any).c;
    const revenue = (await db.prepare(`SELECT COALESCE(SUM(total_amount_paise),0) AS t FROM bookings WHERE status = 'completed' AND is_deleted = 0`).get() as any).t;
    return { total_bookings: total, active_bookings: active, completed_bookings: completed, cancelled_bookings: cancelled, total_revenue_paise: revenue };
  }

  // ---------- Admin: open disputes ----------
  async openDisputes(): Promise<any[]> {
    return await (await this.db().prepare(`SELECT * FROM disputes WHERE status = 'open' AND is_deleted = 0 ORDER BY created_at DESC`).all()).map((r: any) => ({
      id: r.id, booking_id: r.booking_id, raised_by: r.raised_by,
      against_user_id: r.against_user_id, reason: r.reason, status: r.status, created_at: r.created_at,
    }));
  }

  // ---------- Admin: all disputes ----------
  async allDisputes(): Promise<any[]> {
    return await (await this.db().prepare(`SELECT * FROM disputes WHERE is_deleted = 0 ORDER BY created_at DESC`).all()).map((r: any) => ({
      id: r.id, booking_id: r.booking_id, raised_by: r.raised_by,
      against_user_id: r.against_user_id, reason: r.reason, status: r.status, created_at: r.created_at,
    }));
  }

  // ---------- Admin: all bookings filtered (CSV report) ----------
  async allBookingsFiltered(from?: string, to?: string): Promise<any[]> {
    let sql = `SELECT * FROM bookings WHERE is_deleted = 0`;
    const params: any[] = [];
    if (from) { sql += ` AND created_at >= ?`; params.push(from); }
    if (to) { sql += ` AND created_at <= ?`; params.push(to); }
    sql += ` ORDER BY created_at DESC`;
    return await (await this.db().prepare(sql).all(...params)).map((r: any) => this.row2b(r));
  }

  // ---------- Booking detail with car info ----------
  async bookingDetail(id: string, user: any): Promise<any> {
    const b = await this.b(id);
    const car = await this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(b.car_id) as any;
    const renter = await getDb('auth').prepare(`SELECT id, name, phone FROM users WHERE id = ?`).get(b.renter_id) as any;
    const owner = await getDb('auth').prepare(`SELECT id, name, phone FROM users WHERE id = ?`).get(b.owner_id) as any;
    const ext = await this.db().prepare(`SELECT * FROM trip_extensions WHERE booking_id = ? ORDER BY created_at DESC`).all(b.id) as any[];
    const dispute = await this.db().prepare(`SELECT * FROM disputes WHERE booking_id = ? AND is_deleted = 0`).get(b.id) as any;

    return {
      ...this.row2b(b),
      car: car ? { id: car.id, brand: car.brand, model: car.model, plate: car.plate, price_paise_per_day: car.price_paise_per_day, image_url: car.image_url } : null,
      renter: renter ? { id: renter.id, name: renter.name, phone: renter.phone } : null,
      owner: owner ? { id: owner.id, name: owner.name, phone: owner.phone } : null,
      extension: ext ? ext.map((e: any) => ({ id: e.id, status: e.status, requested_end_date: e.requested_end_date, additional_days: e.additional_days, additional_amount_paise: e.additional_amount_paise })) : [],
      dispute: dispute ? { id: dispute.id, status: dispute.status, reason: dispute.reason, resolution_note: dispute.resolution_note } : null,
    };
  }
  // ---------- Reviews written by this user ----------
  async getReviewsByReviewer(userId: string): Promise<any[]> {
    // Reviews live in the booking DB; user names live in the auth DB, so names
    // are resolved separately (no cross-DB joins anywhere in this codebase).
    // target_user_id is a car id when target_type = 'car', a user id otherwise.
    const rows = await this.db().prepare(`
      SELECT r.id, r.booking_id, r.reviewer_id, r.target_type, r.target_user_id,
             r.rating, r.comment, r.created_at,
             b.car_id,
             c.brand AS car_brand,
             c.model  AS car_model
      FROM reviews r
      JOIN bookings b ON r.booking_id = b.id
      LEFT JOIN car_cache c ON c.id = b.car_id
      WHERE r.reviewer_id = ? AND r.is_deleted = 0
      ORDER BY r.created_at DESC
    `).all(userId) as any[];

    const nameStmt = getDb('auth').prepare(`SELECT name FROM users WHERE id = ?`);
    return await Promise.all(rows.map(async (r: any) => ({
      id: r.id,
      booking_id: r.booking_id,
      reviewer_id: r.reviewer_id,
      target_type: r.target_type,
      target_user_id: r.target_user_id,
      target_name: r.target_type === 'car'
        ? (r.car_brand && r.car_model ? `${r.car_brand} ${r.car_model}` : null)
        : ((await nameStmt.get(r.target_user_id) as any)?.name ?? null),
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      car: r.car_id ? { id: r.car_id, brand: r.car_brand, model: r.car_model } : null,
    })));
  }

  // ---------- Reviews written about this user ----------
  async getReviewsAboutMe(userId: string, role: string): Promise<{ avg_rating: number; total_reviews: number; reviews: any[] }> {
    // Reviews about me are typed by MY role: the other party rated me as what I
    // am. A car_renter is rated 'renter' (by the owner); a car_owner is rated
    // 'owner' (by the renter) — matching leaveReview's target selection. Pinning
    // target_type also means a car-target row (target_user_id holds a car id)
    // can never leak in.
    const targetType = role === 'car_renter' ? 'renter' : 'owner';

    const stats = await this.db().prepare(`
      SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avg_rating
      FROM reviews
      WHERE target_type = ? AND target_user_id = ? AND is_deleted = 0
    `).get(targetType, userId) as any;

    const rows = await this.db().prepare(`
      SELECT r.id, r.booking_id, r.reviewer_id, r.rating, r.comment, r.created_at, b.car_id
      FROM reviews r
      JOIN bookings b ON b.id = r.booking_id
      WHERE r.target_type = ? AND r.target_user_id = ? AND r.is_deleted = 0
      ORDER BY r.created_at DESC
    `).all(targetType, userId) as any[];

    const adb = getDb('auth');
    const nameStmt = adb.prepare(`SELECT name FROM users WHERE id = ?`);
    const carStmt = this.db().prepare(`SELECT brand, model FROM car_cache WHERE id = ?`);

    const reviews = await Promise.all(rows.map(async (r: any) => {
      const car = r.car_id ? ((await carStmt.get(r.car_id)) as any) : null;
      return {
        id: r.id,
        booking_id: r.booking_id,
        reviewer_id: r.reviewer_id,
        reviewer_name: ((await nameStmt.get(r.reviewer_id) as any)?.name ?? 'A user'),
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        car: car ? { id: r.car_id, brand: car.brand, model: car.model } : null,
      };
    }));

    return {
      avg_rating: Math.round((stats.avg_rating || 0) * 10) / 10,
      total_reviews: stats.count,
      reviews,
    };
  }
}
