import { BadRequestException, Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { writeAudit } from '../../common/audit/audit';
import { PaymentsService } from '../payments/payments.service';
import { BookingsService } from '../bookings/bookings.service';
import { FleetService } from '../fleet/fleet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AdminService {
  constructor(
    private payments: PaymentsService,
    private bookings: BookingsService,
    private fleet: FleetService,
    private notifier: NotificationsService,
    private auth: AuthService,
  ) {}

  // ---------- 5.5 Task 1.1: platform-wide dashboard ----------
  overview() {
    this.bookings.sweepSettlements(); // lazy settlement pass on admin view
    const adb = getDb('auth');
    const fdb = getDb('fleet');
    const byRole = adb.prepare(`SELECT role, COUNT(*) AS count FROM users WHERE is_deleted = 0 GROUP BY role`).all() as any[];
    const activeCars = (fdb.prepare(`SELECT COUNT(*) AS c FROM cars WHERE status = 'active' AND is_deleted = 0`).get() as any).c;
    const pendingCars = (fdb.prepare(`SELECT COUNT(*) AS c FROM cars WHERE status = 'pending_review' AND is_deleted = 0`).get() as any).c;
    return {
      users_by_role: byRole,
      total_users: byRole.reduce((s, r) => s + r.count, 0),
      active_cars: activeCars,
      pending_review_cars: pendingCars,
      bookings: this.bookings.platformStats(),
      revenue: this.payments.platformRevenue(),
    };
  }

  // ---------- Task 1.2: user management ----------
  listUsers(search?: string, role?: string) {
    let sql = `SELECT id, name, email, phone, role, status, kyc_status, created_at FROM users WHERE is_deleted = 0`;
    const params: any[] = [];
    if (search) { sql += ` AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (role) { sql += ` AND role = ?`; params.push(role); }
    sql += ` ORDER BY created_at DESC LIMIT 500`;
    return getDb('auth').prepare(sql).all(...params);
  }

  setUserStatus(adminId: string, userId: string, status: 'active' | 'suspended' | 'banned') {
    if (userId === adminId) throw new BadRequestException('Cannot change your own status');
    const before = getDb('auth').prepare(`SELECT id, status FROM users WHERE id = ?`).get(userId) as any;
    if (!before) throw new BadRequestException('User not found');
    getDb('auth').prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`).run(status, nowUtc(), userId);
    writeAudit('auth', { actor_id: adminId, action: `user.${status}`, entity_type: 'user', entity_id: userId, before_value: before, after_value: { status } });
    this.notifier.notify(userId, 'account', `Account ${status}`, `Your account has been set to "${status}" by the platform.`, adminId);
    return { message: `User is now ${status}` };
  }

  // ---------- Task 1.3: car approval queue ----------
  carApprovalQueue() {
    const rows = getDb('fleet').prepare(
      `SELECT * FROM cars WHERE status = 'pending_review' AND is_deleted = 0 ORDER BY updated_at ASC`,
    ).all() as any[];
    return rows.map((car) => ({
      ...car,
      photos: getDb('fleet').prepare(`SELECT file_url FROM car_photos WHERE car_id = ? AND is_deleted = 0 ORDER BY sort_order`).all(car.id),
      documents: getDb('fleet').prepare(`SELECT doc_type, file_url FROM car_documents WHERE car_id = ? AND is_deleted = 0`).all(car.id),
      pricing_missing: (getDb('fleet').prepare(`SELECT daily_rate_paise FROM car_pricing WHERE car_id = ?`).get(car.id) as any)?.daily_rate_paise === undefined,
    }));
  }

  decideCar(adminId: string, carId: string, decision: 'approve' | 'reject', reason?: string) {
    const db = getDb('fleet');
    const car = db.prepare(`SELECT * FROM cars WHERE id = ? AND is_deleted = 0`).get(carId) as any;
    if (!car || car.status !== 'pending_review') throw new BadRequestException('Car not pending review');
    if (decision === 'reject' && !reason) throw new BadRequestException('Rejection reason is mandatory');
    if (decision === 'approve') {
      // Rule 2.3: cannot activate without daily_rate
      if (this.fleet.ownerDailyRateMissing(carId)) throw new BadRequestException('Owner must set a daily rate first');
    }
    db.prepare(`UPDATE cars SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ?`)
      .run(decision === 'approve' ? 'active' : 'rejected', decision === 'reject' ? reason : null, nowUtc(), carId);
    this.fleet.syncCarCache();
    writeAudit('fleet', {
      actor_id: adminId, action: `car.${decision}d`, entity_type: 'car', entity_id: carId,
      before_value: { status: 'pending_review' }, after_value: { status: decision === 'approve' ? 'active' : 'rejected', reason },
    });
    this.notifier.notify(car.owner_id, 'car',
      decision === 'approve' ? 'Car approved!' : `Car rejected`,
      decision === 'approve' ? `${car.make} ${car.model} is now live.` : `Reason: ${reason}`, adminId);
    return { message: `Car ${decision}d` };
  }

  // ---------- Task 2.1: settings ----------
  settings() { return this.payments.listSettings(); }
  updateSetting(adminId: string, key: string, valueInt: number) {
    return this.payments.setSetting(adminId, key, valueInt);
  }

  // ---------- Task 2.2: payouts ----------
  payouts(status?: string) { return this.payments.listPayoutsForAdmin(status); }

  approvePayout(adminId: string, payoutId: string) {
    const r = this.payments.decidePayout(adminId, payoutId, 'approve');
    const p = getDb('payment').prepare(`SELECT * FROM payouts WHERE id = ?`).get(payoutId) as any;
    this.notifier.notify(p.user_id, 'payout', 'Payout approved', 'Your payout was approved and will be paid out.', adminId);
    return r;
  }
  rejectPayout(adminId: string, payoutId: string, reason: string) {
    return this.payments.decidePayout(adminId, payoutId, 'reject', reason);
  }
  markPaid(adminId: string, payoutId: string) {
    return this.payments.markPayoutPaid(adminId, payoutId);
  }

  // ---------- Task 2.3: disputes ----------
  openDisputes() { return this.bookings.openDisputes(); }
  allDisputes() { return this.bookings.allDisputes(); }
  resolveDispute(adminId: string, disputeId: string, resolution: any) {
    return this.bookings.resolveDispute(adminId, disputeId, resolution);
  }

  // ---------- Role change requests ----------
  listRoleChangeRequests(status?: string) {
    const adb = getDb('auth');
    const rows = status
      ? adb.prepare(`SELECT * FROM role_change_requests WHERE status = ? ORDER BY created_at ASC`).all(status)
      : adb.prepare(`SELECT * FROM role_change_requests ORDER BY created_at DESC LIMIT 200`).all();
    return rows.map((r: any) => {
      const u = adb.prepare(`SELECT name, email, role FROM users WHERE id = ?`).get(r.user_id) as any;
      return { ...r, user_name: u?.name, user_email: u?.email, current_role_now: u?.role };
    });
  }

  decideRoleChange(adminId: string, requestId: string, decision: 'approve' | 'reject') {
    const r = getDb('auth').prepare(`SELECT * FROM role_change_requests WHERE id = ?`).get(requestId) as any;
    if (!r) throw new BadRequestException('Request not found');
    const result = this.auth.decideRoleChange(adminId, requestId, decision);
    this.notifier.notify(r.user_id, 'account', `Role change ${decision}d`,
      decision === 'approve' ? `Your role is now ${r.desired_role}.` : 'Your role change request was rejected.', adminId);
    return result;
  }

  // ---------- Agents management ----------
  listAgents() {
    const adb = getDb('agent');
    const rows = adb.prepare(`SELECT * FROM agents WHERE is_deleted = 0`).all() as any[];
    const authDb = getDb('auth');
    return rows.map((a) => {
      const u = authDb.prepare(`SELECT name, email, phone, status FROM users WHERE id = ?`).get(a.user_id) as any;
      return { ...a, name: u?.name, email: u?.email, phone: u?.phone };
    });
  }

  setAgentSalary(adminId: string, agentUserId: string, salaryPaise: number) {
    const db = getDb('agent');
    let profile = db.prepare(`SELECT * FROM agents WHERE user_id = ?`).get(agentUserId) as any;
    if (!profile) {
      db.prepare(`INSERT INTO agents (id, user_id, monthly_salary_paise, created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?)`).run(uuid(), agentUserId, salaryPaise, nowUtc(), nowUtc(), adminId);
    } else {
      writeAudit('agent', { actor_id: adminId, action: 'agent.salary_set', entity_type: 'agent', entity_id: agentUserId, before_value: profile, after_value: { monthly_salary_paise: salaryPaise } });
      db.prepare(`UPDATE agents SET monthly_salary_paise = ?, updated_at = ? WHERE user_id = ?`).run(salaryPaise, nowUtc(), agentUserId);
    }
    return { message: 'Salary saved' };
  }

  assignLead(adminId: string, agentUserId: string, leadUserId: string, type: string) {
    const db = getDb('agent');
    db.prepare(
      `INSERT INTO agent_assignments (id, agent_user_id, assignment_type, lead_user_id, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, 'assigned', ?, ?, ?)`,
    ).run(uuid(), agentUserId, type, leadUserId, nowUtc(), nowUtc(), adminId);
    return { message: 'Assignment created' };
  }

  // ---------- Task 3.1: CSV reports ----------
  reportCsv(kind: 'bookings' | 'revenue' | 'subscriptions', from?: string, to?: string): string {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    if (kind === 'bookings') {
      const rows = this.bookings.allBookingsFiltered(from, to);
      const head = ['id', 'car_id', 'renter_id', 'owner_id', 'start_date', 'end_date', 'status', 'total_amount_paise', 'online_paid_paise', 'late_fee_paise', 'created_at'];
      return [head.join(','), ...rows.map((r: any) => head.map((h) => esc(r[h])).join(','))].join('\n');
    }
    if (kind === 'revenue') {
      const rows = getDb('payment').prepare(
        `SELECT * FROM transactions ORDER BY created_at DESC`,
      ).all().filter((t: any) => (!from || t.created_at >= from) && (!to || t.created_at <= to));
      const head = ['id', 'booking_id', 'payer_id', 'payee_id', 'amount_paise', 'type', 'method', 'status', 'created_at'];
      return [head.join(','), ...rows.map((r: any) => head.map((h) => esc(r[h])).join(','))].join('\n');
    }
    const rows = getDb('payment').prepare(
      `SELECT * FROM subscriptions ORDER BY created_at DESC`,
    ).all().filter((s: any) => (!from || s.created_at >= from) && (!to || s.created_at <= to));
    const head = ['id', 'user_id', 'plan', 'price_paid_paise', 'period_start', 'period_end', 'status', 'created_at'];
    return [head.join(','), ...rows.map((r: any) => head.map((h) => esc(r[h])).join(','))].join('\n');
  }
}
