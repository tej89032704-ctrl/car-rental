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
  private b(id: string): any {
    const row = this.db().prepare(`SELECT * FROM bookings WHERE id = ?`).get(id) as any;
    if (!row) throw new NotFoundException(`Booking ${id} not found`);
    return row;
  }

  private bRaw(id: string): any {
    return this.db().prepare(`SELECT * FROM bookings WHERE id = ?`).get(id);
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
  createRequest(renterId: string, body: { car_id: string; start_date: string; end_date: string }) {
    let car = this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(body.car_id) as any;
    if (!car) {
      // cache may be stale (e.g. fresh boot before sync) — pull from fleet and cache it
      const fleetRow = getDb('fleet').prepare(
        `SELECT c.id, c.owner_id, c.make, c.model, c.plate_number, c.category, c.status,
                p.daily_rate_paise, p.security_deposit_paise
         FROM cars c LEFT JOIN car_pricing p ON p.car_id = c.id
         WHERE c.id = ?`, 
      ).get(body.car_id) as any;
      if (!fleetRow) throw new NotFoundException(`Car ${body.car_id} not found`);
      this.db().prepare(
        `INSERT INTO car_cache (id, brand, model, plate, category, price_paise_per_day, security_deposit_paise, image_url, owner_id, status, is_available, is_deleted, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, 0, ?)`,
      ).run(fleetRow.id, fleetRow.make, fleetRow.model, fleetRow.plate_number, fleetRow.category,
        fleetRow.daily_rate_paise || 0, fleetRow.security_deposit_paise || 0, fleetRow.owner_id, fleetRow.status, nowUtc());
      car = this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(body.car_id);
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
    this.db().prepare(`INSERT INTO bookings (id, car_id, renter_id, owner_id, start_date, end_date, status, total_amount_paise, online_paid_paise, remaining_due_paise, security_deposit_paise, late_fee_paise, completed_at, cancelled_at, is_deleted, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, 0, ?, ?, 0, NULL, NULL, 0, ?, ?, ?)`)
      .run(id, body.car_id, renterId, car.owner_id, startDay, endDay, total, total,
        car.security_deposit_paise || 0, now, now, renterId);

    writeAudit('booking', {
      actor_id: renterId, action: 'booking.requested', entity_type: 'booking',
      entity_id: id, after_value: { car_id: body.car_id, start_date: body.start_date, end_date: body.end_date, total_amount_paise: total },
    });

    this.db().prepare(`UPDATE car_cache SET is_available = 0 WHERE id = ?`).run(body.car_id);

    const renter = getDb('auth').prepare(`SELECT name FROM users WHERE id = ?`).get(renterId) as any;
    this.notifier.notify(car.owner_id, 'booking', 'New booking request',
      `${renter?.name ?? 'A renter'} requested ${car.brand} ${car.model} (${body.start_date} → ${body.end_date})`, renterId);

    return { id, status: 'requested', total_amount_paise: total, car: { id: car.id, brand: car.brand, model: car.model, plate: car.plate, price_paise_per_day: car.price_paise_per_day, image_url: car.image_url } };
  }

  // ---------- Renter / Owner: my bookings ----------
  myBookings(userId: string, role: string): any[] {
    const stmt = role === 'car_renter'
      ? `SELECT * FROM bookings WHERE renter_id = ? AND is_deleted = 0 ORDER BY created_at DESC`
      : `SELECT * FROM bookings WHERE owner_id = ? AND is_deleted = 0 ORDER BY created_at DESC`;
    return this.db().prepare(stmt).all(userId).map((r: any) => {
      const car = this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(r.car_id) as any;
      const owner = getDb('auth').prepare(`SELECT id, name FROM users WHERE id = ?`).get(r.owner_id) as any;
      const out: any = {
        ...this.row2b(r),
        car: car ? { id: car.id, brand: car.brand, model: car.model, plate: car.plate, category: car.category, price_paise_per_day: car.price_paise_per_day, image_url: car.image_url } : null,
        owner: owner ? { id: owner.id, name: owner.name } : null,
      };
      const review = this.db().prepare(`SELECT id FROM reviews WHERE booking_id = ? AND reviewer_id = ? AND is_deleted = 0`).get(r.id, userId);
      if (review) out.has_reviewed = true;
      return out;
    });
  }

  // ---------- Renter: cancel ----------
  cancelByRenter(renterId: string, id: string, reason?: string) {
    const b = this.b(id);
    if (b.status !== 'requested' && b.status !== 'confirmed' && b.status !== 'ongoing') throw new BadRequestException(`Cannot cancel booking in status ${b.status}`);
    if (b.renter_id !== renterId) throw new BadRequestException('Not your booking');

    const now = nowUtc();

    this.db().prepare(`UPDATE bookings SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?`)
      .run(now, now, id);
    this.db().prepare(`UPDATE car_cache SET is_available = 1 WHERE id = ?`).run(b.car_id);

    const startDate = new Date(b.start_date + 'T00:00:00Z');
    const daysUntilStart = Math.max(0, Math.round((startDate.getTime() - Date.now()) / 86400000));

    let tier: string, refund: number, penalty: number;
    if (b.status === 'requested') {
      tier = 'free'; refund = b.total_amount_paise; penalty = 0;
    } else if (daysUntilStart >= 1) {
      // Spec 6.3: free cancellation >= 24h before start
      tier = 'free'; refund = b.total_amount_paise; penalty = 0;
    } else if (daysUntilStart === 0) {
      // Spec 6.3: 50% within 24h of start
      tier = 'partial_50'; refund = Math.floor(b.total_amount_paise / 2); penalty = b.total_amount_paise - refund;
    } else {
      tier = 'no_refund'; refund = 0; penalty = b.total_amount_paise;
    }

    if (refund > 0) {
      // refunds are recorded in the payments ledger (payment.db), never in booking.db
      this.payments.refundPartialRental(b, refund, `Cancellation (${tier})`, renterId);
    }

    this.db().prepare(`INSERT INTO cancellations (id, booking_id, cancelled_by, tier, refund_amount_paise, penalty_amount_paise, reason, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uuid(), id, renterId, tier, refund, penalty, reason || null, now, now, renterId);

    writeAudit('booking', { actor_id: renterId, action: 'booking.cancelled', entity_type: 'booking', entity_id: id, after_value: { tier, refund_amount_paise: refund, penalty_amount_paise: penalty } });
    return { message: `Cancelled (${tier})`, refund_amount_paise: refund, penalty_amount_paise: penalty };
  }

  // ---------- Renter: pay online (20% partial after owner approval) ----------
  payOnline(renterId: string, id: string) {
    const b = this.b(id);
    if (b.renter_id !== renterId) throw new BadRequestException('Not your booking');
    if (b.status !== 'confirmed') throw new BadRequestException('Online payment is only available after the owner confirms the booking');
    if (b.online_paid_paise > 0) throw new BadRequestException('Online payment already made for this booking');

    const res = this.payments.captureBookingPartial(b, renterId);
    const onlinePaid = res.rental_part_paise;
    const remaining = b.total_amount_paise - onlinePaid;
    const now = nowUtc();

    this.db().prepare(`UPDATE bookings SET online_paid_paise = ?, remaining_due_paise = ?, updated_at = ? WHERE id = ?`)
      .run(onlinePaid, remaining, now, id);

    writeAudit('booking', { actor_id: renterId, action: 'booking.paid_online', entity_type: 'booking', entity_id: id, after_value: { online_paid_paise: onlinePaid, remaining_due_paise: remaining, deposit_held_paise: res.deposit_held_paise, invoice_number: res.invoice_number } });
    this.notifier.notify(b.owner_id, 'payment', 'Online payment received',
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
  requestExtension(renterId: string, id: string, newEnd: string) {
    const b = this.b(id);
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

    const car = this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(b.car_id) as any;
    const additionalAmount = additionalDays * car.price_paise_per_day;

    const extId = uuid();
    this.db().prepare(`INSERT INTO trip_extensions (id, booking_id, requested_end_date, additional_days, additional_amount_paise, status, created_at, updated_at, created_by)
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
  bookingRequestsForOwner(ownerId: string): any[] {
    return this.db().prepare(`SELECT * FROM bookings WHERE owner_id = ? AND status = 'requested' AND is_deleted = 0 ORDER BY created_at DESC`).all(ownerId).map((r: any) => this.row2b(r));
  }

  // ---------- Owner: completed bookings ----------
  completedBookingsForOwner(ownerId: string): any[] {
    return this.db().prepare(`SELECT * FROM bookings WHERE owner_id = ? AND status = 'completed' AND is_deleted = 0 ORDER BY completed_at DESC`).all(ownerId).map((r: any) => {
      const car = this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(r.car_id) as any;
      const renter = getDb('auth').prepare(`SELECT id, name FROM users WHERE id = ?`).get(r.renter_id) as any;
      const review = this.db().prepare(`SELECT * FROM reviews WHERE booking_id = ? AND reviewer_id = ? AND is_deleted = 0`).get(r.id, ownerId) as any;
      return {
        ...this.row2b(r),
        car: car ? { id: car.id, brand: car.brand, model: car.model, plate: car.plate } : null,
        renter: renter ? { id: renter.id, name: renter.name } : null,
        has_reviewed: !!review,
      };
    });
  }

  // ---------- Owner: decide (approve/reject) ----------
  ownerDecide(ownerId: string, id: string, decision: 'approve' | 'reject') {
    const b = this.b(id);
    if (b.status !== 'requested') throw new BadRequestException('Only requested bookings can be decided');
    if (b.owner_id !== ownerId) throw new BadRequestException('Not your car');
    if (b.is_deleted) throw new BadRequestException('Booking deleted');

    if (decision === 'reject') {
      this.db().prepare(`UPDATE bookings SET status = 'rejected', updated_at = ? WHERE id = ?`).run(nowUtc(), id);
      this.db().prepare(`UPDATE car_cache SET is_available = 1 WHERE id = ?`).run(b.car_id);
      writeAudit('booking', { actor_id: ownerId, action: 'booking.rejected', entity_type: 'booking', entity_id: id });
      return { message: 'Rejected' };
    }

    this.db().prepare(`UPDATE bookings SET status = 'confirmed', updated_at = ? WHERE id = ?`).run(nowUtc(), id);
    writeAudit('booking', { actor_id: ownerId, action: 'booking.approved', entity_type: 'booking', entity_id: id });
    const car = this.db().prepare(`SELECT brand, model FROM car_cache WHERE id = ?`).get(b.car_id) as any;
    this.notifier.notify(b.renter_id, 'booking', 'Booking approved!',
      `Your booking for ${car?.brand} ${car?.model} was approved. Pay 20% online in My Bookings to confirm.`, ownerId);
    return { message: 'Approved', status: 'confirmed' };
  }

  // ---------- Owner: start trip (cash pickup) ----------
  startTripWithCashRecorded(ownerId: string, id: string) {
    const b = this.b(id);
    if (b.status !== 'confirmed') throw new BadRequestException('Booking must be confirmed first');
    if (b.owner_id !== ownerId) throw new BadRequestException('Not your car');

    this.db().prepare(`UPDATE bookings SET status = 'ongoing', updated_at = ? WHERE id = ?`).run(nowUtc(), id);
    if ((b.remaining_due_paise) > 0) {
      this.payments.markPickupCashCollected(b, ownerId);
      // cash/UPI was handed over at pickup -> nothing left due at the platform
      this.db().prepare(`UPDATE bookings SET remaining_due_paise = 0, updated_at = ? WHERE id = ?`).run(nowUtc(), id);
    }
    writeAudit('booking', { actor_id: ownerId, action: 'trip.started', entity_type: 'booking', entity_id: id, after_value: { remaining_due_collected: b.remaining_due_paise } });
    this.notifier.notify(b.renter_id, 'trip', 'Trip started', 'Your trip has started. Drive safe!', ownerId);
    return { message: 'Trip started' };
  }

  // ---------- Owner: complete trip ----------
  completeTrip(ownerId: string, id: string) {
    const b = this.b(id);
    if (b.status !== 'ongoing') throw new BadRequestException('Only ongoing trips can be completed');
    if (b.owner_id !== ownerId) throw new BadRequestException('Not your car');

    const now = nowUtc();
    this.db().prepare(`UPDATE bookings SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);
    this.db().prepare(`UPDATE car_cache SET is_available = 1 WHERE id = ?`).run(b.car_id);
    if (b.online_paid_paise > 0) {
      this.payments.settleOwnerEarnings(b, ownerId);
    }
    writeAudit('booking', { actor_id: ownerId, action: 'trip.completed', entity_type: 'booking', entity_id: id });
    this.notifier.notify(b.renter_id, 'trip', 'Trip completed', 'Your trip is complete. Thanks for driving with DriveNow!', ownerId);
    return { message: 'Trip completed', late_fee_paise: b.late_fee_paise ?? 0 };
  }

  // ---------- Owner: decide extension ----------
  decideExtension(ownerId: string, id: string, decision: 'approve' | 'reject') {
    const ext = this.db().prepare(`SELECT * FROM trip_extensions WHERE id = ?`).get(id) as any;
    if (!ext) throw new NotFoundException(`Extension ${id} not found`);
    const b = this.b(ext.booking_id);
    if (b.owner_id !== ownerId) throw new BadRequestException('Not your car');

    const now = nowUtc();
    if (decision === 'approve') {
      this.db().prepare(`UPDATE trip_extensions SET status = 'approved', decided_by = ?, updated_at = ? WHERE id = ?`).run(ownerId, now, id);
      this.db().prepare(`UPDATE bookings SET end_date = ?, remaining_due_paise = remaining_due_paise + ?, updated_at = ? WHERE id = ?`)
        .run(ext.requested_end_date, ext.additional_amount_paise, now, ext.booking_id);
      writeAudit('booking', { actor_id: ownerId, action: 'extension.approved', entity_type: 'trip_extension', entity_id: id, after_value: { booking_id: ext.booking_id, new_end_date: ext.requested_end_date } });
      return { message: 'Extension approved', status: 'approved' };
    }

    this.db().prepare(`UPDATE trip_extensions SET status = 'rejected', decided_by = ?, updated_at = ? WHERE id = ?`).run(ownerId, now, id);
    writeAudit('booking', { actor_id: ownerId, action: 'extension.rejected', entity_type: 'trip_extension', entity_id: id });
    return { message: 'Extension rejected', status: 'rejected' };
  }

  // ---------- Both: reviews ----------
  leaveReview(userId: string, role: string, data: { booking_id: string; rating: number; comment?: string }) {
    const b = this.b(data.booking_id);
    if (b.status !== 'completed') throw new BadRequestException('Can only review completed trips');
    if (b.is_deleted) throw new BadRequestException('Booking deleted');

    const existing = this.db().prepare(`SELECT * FROM reviews WHERE booking_id = ? AND reviewer_id = ? AND is_deleted = 0`).all(data.booking_id, userId) as any[];
    if (existing.length > 0) throw new BadRequestException('Already reviewed this booking');

    let targetType: 'car' | 'owner' | 'renter';
    let targetUserId: string;
    if (role === 'car_renter') {
      targetType = 'owner';
      targetUserId = b.owner_id;
    } else {
      targetType = 'car';
      targetUserId = b.car_id;
    }

    const id = uuid();
    this.db().prepare(`INSERT INTO reviews (id, booking_id, reviewer_id, target_type, target_user_id, rating, comment, is_deleted, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
      .run(id, data.booking_id, userId, targetType, targetUserId, data.rating, data.comment || null, nowUtc(), nowUtc(), userId);

    writeAudit('booking', { actor_id: userId, action: 'review.created', entity_type: 'review', entity_id: id, after_value: { booking_id: data.booking_id, rating: data.rating } });
    return { id, rating: data.rating, comment: data.comment || null };
  }

  // ---------- Both: disputes ----------
  raiseDispute(raisedBy: string, data: { booking_id: string; reason: string }) {
    const b = this.b(data.booking_id);
    if (b.status !== 'completed' && b.status !== 'requested') throw new BadRequestException('Can only dispute requested or completed bookings');
    if (b.is_deleted) throw new BadRequestException('Booking deleted');
    if (b.renter_id !== raisedBy && b.owner_id !== raisedBy) throw new BadRequestException('Not a participant');

    const id = uuid();
    this.db().prepare(`INSERT INTO disputes (id, booking_id, raised_by, against_user_id, reason, status, is_deleted, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, 'open', 0, ?, ?, ?)`)
      .run(id, data.booking_id, raisedBy, raisedBy === b.renter_id ? b.owner_id : b.renter_id, data.reason, nowUtc(), nowUtc(), raisedBy);

    writeAudit('booking', { actor_id: raisedBy, action: 'dispute.raised', entity_type: 'dispute', entity_id: id, after_value: { booking_id: data.booking_id, reason: data.reason } });
    return { id, status: 'open' };
  }

  // ---------- Owner: pending extensions ----------
  pendingExtensionsForOwner(ownerId: string): any[] {
    const exts = this.db().prepare(`
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
  resolveDispute(adminId: string, disputeId: string, data: { resolution_note: string; refund_amount_paise?: number; penalty_amount_paise?: number }) {
    const d = this.db().prepare(`SELECT * FROM disputes WHERE id = ?`).get(disputeId) as any;
    if (!d) throw new NotFoundException(`Dispute ${disputeId} not found`);
    if (d.status !== 'open') throw new BadRequestException('Dispute already resolved');

    this.db().prepare(`UPDATE disputes SET status = 'resolved', resolution_note = ?, resolved_by = ?, resolved_at = ?, refund_amount_paise = COALESCE(?, refund_amount_paise), penalty_amount_paise = COALESCE(?, penalty_amount_paise), updated_at = ? WHERE id = ?`)
      .run(data.resolution_note, adminId, nowUtc(), data.refund_amount_paise, data.penalty_amount_paise, nowUtc(), disputeId);

    writeAudit('booking', { actor_id: adminId, action: 'dispute.resolved', entity_type: 'dispute', entity_id: disputeId, after_value: { resolution_note: data.resolution_note } });
    return { message: 'Dispute resolved' };
  }

  // ---------- Disputes list (admin) ----------
  listDisputes(): any[] {
    return this.db().prepare(`SELECT * FROM disputes WHERE status = 'open' AND is_deleted = 0 ORDER BY created_at DESC`).all().map((r: any) => ({
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
  sweepSettlements(): { swept: number } {
    const hours = this.payments.getSettingInt('deposit_refund_hours') || 24;
    const cutoff = Date.now() - hours * 3600000;
    const rows = this.db().prepare(
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
      const openDispute = this.db().prepare(`SELECT id FROM disputes WHERE booking_id = ? AND status = 'open' AND is_deleted = 0`).get(b.id);
      const already = this.pdb().prepare(`SELECT id FROM transactions WHERE booking_id = ? AND type = 'deposit_refund'`).get(b.id);
      if (openDispute || already) continue;
      this.payments.refundDeposit(b, `Auto refund after dispute window (${hours}h)`, 'system');
      swept++;
    }
    return { swept };
  }

  // ---------- Admin: platform stats ----------
  platformStats(): { total_bookings: number; active_bookings: number; completed_bookings: number; cancelled_bookings: number; total_revenue_paise: number } {
    const db = this.db();
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE is_deleted = 0`).get() as any).c;
    const active = (db.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE status IN ('requested','confirmed','ongoing') AND is_deleted = 0`).get() as any).c;
    const completed = (db.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE status = 'completed' AND is_deleted = 0`).get() as any).c;
    const cancelled = (db.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE status = 'cancelled' AND is_deleted = 0`).get() as any).c;
    const revenue = (db.prepare(`SELECT COALESCE(SUM(total_amount_paise),0) AS t FROM bookings WHERE status = 'completed' AND is_deleted = 0`).get() as any).t;
    return { total_bookings: total, active_bookings: active, completed_bookings: completed, cancelled_bookings: cancelled, total_revenue_paise: revenue };
  }

  // ---------- Admin: open disputes ----------
  openDisputes(): any[] {
    return this.db().prepare(`SELECT * FROM disputes WHERE status = 'open' AND is_deleted = 0 ORDER BY created_at DESC`).all().map((r: any) => ({
      id: r.id, booking_id: r.booking_id, raised_by: r.raised_by,
      against_user_id: r.against_user_id, reason: r.reason, status: r.status, created_at: r.created_at,
    }));
  }

  // ---------- Admin: all disputes ----------
  allDisputes(): any[] {
    return this.db().prepare(`SELECT * FROM disputes WHERE is_deleted = 0 ORDER BY created_at DESC`).all().map((r: any) => ({
      id: r.id, booking_id: r.booking_id, raised_by: r.raised_by,
      against_user_id: r.against_user_id, reason: r.reason, status: r.status, created_at: r.created_at,
    }));
  }

  // ---------- Admin: all bookings filtered (CSV report) ----------
  allBookingsFiltered(from?: string, to?: string): any[] {
    let sql = `SELECT * FROM bookings WHERE is_deleted = 0`;
    const params: any[] = [];
    if (from) { sql += ` AND created_at >= ?`; params.push(from); }
    if (to) { sql += ` AND created_at <= ?`; params.push(to); }
    sql += ` ORDER BY created_at DESC`;
    return this.db().prepare(sql).all(...params).map((r: any) => this.row2b(r));
  }

  // ---------- Booking detail with car info ----------
  bookingDetail(id: string, user: any): any {
    const b = this.b(id);
    const car = this.db().prepare(`SELECT * FROM car_cache WHERE id = ?`).get(b.car_id) as any;
    const renter = getDb('auth').prepare(`SELECT id, name, phone FROM users WHERE id = ?`).get(b.renter_id) as any;
    const owner = getDb('auth').prepare(`SELECT id, name, phone FROM users WHERE id = ?`).get(b.owner_id) as any;
    const ext = this.db().prepare(`SELECT * FROM trip_extensions WHERE booking_id = ? ORDER BY created_at DESC`).all(b.id) as any[];
    const dispute = this.db().prepare(`SELECT * FROM disputes WHERE booking_id = ? AND is_deleted = 0`).get(b.id) as any;

    return {
      ...this.row2b(b),
      car: car ? { id: car.id, brand: car.brand, model: car.model, plate: car.plate, price_paise_per_day: car.price_paise_per_day, image_url: car.image_url } : null,
      renter: renter ? { id: renter.id, name: renter.name, phone: renter.phone } : null,
      owner: owner ? { id: owner.id, name: owner.name, phone: owner.phone } : null,
      extension: ext ? ext.map((e: any) => ({ id: e.id, status: e.status, requested_end_date: e.requested_end_date, additional_days: e.additional_days, additional_amount_paise: e.additional_amount_paise })) : [],
      dispute: dispute ? { id: dispute.id, status: dispute.status, reason: dispute.reason, resolution_note: dispute.resolution_note } : null,
    };
  }
}
