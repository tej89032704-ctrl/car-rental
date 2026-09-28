import { BadRequestException, Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { writeAudit } from '../../common/audit/audit';
import { PaymentsService } from '../payments/payments.service';
import { BookingsService } from '../bookings/bookings.service';
import { FleetService } from '../fleet/fleet.service';
import { CarVerificationService } from '../fleet/car-verification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AdminService {
  constructor(
    private payments: PaymentsService,
    private bookings: BookingsService,
    private fleet: FleetService,
    private carVerify: CarVerificationService,
    private notifier: NotificationsService,
    private auth: AuthService,
  ) {}

  // ---------- 5.5 Task 1.1: platform-wide dashboard ----------
  async overview() {
    await this.bookings.sweepSettlements(); // lazy settlement pass on admin view
    const adb = getDb('auth');
    const fdb = getDb('fleet');
    const byRole = await adb.prepare(`SELECT role, COUNT(*) AS count FROM users WHERE is_deleted = 0 GROUP BY role`).all() as any[];
    const activeCars = (await fdb.prepare(`SELECT COUNT(*) AS c FROM cars WHERE status = 'active' AND is_deleted = 0`).get() as any).c;
    const pendingCars = (await fdb.prepare(`SELECT COUNT(*) AS c FROM cars WHERE status = 'pending_review' AND is_deleted = 0`).get() as any).c;
    return {
      users_by_role: byRole,
      total_users: byRole.reduce((s, r) => s + r.count, 0),
      active_cars: activeCars,
      pending_review_cars: pendingCars,
      bookings: await this.bookings.platformStats(),
      revenue: await this.payments.platformRevenue(),
    };
  }

  // ---------- Task 1.2: user management ----------
  async listUsers(search?: string, role?: string) {
    let sql = `SELECT id, name, email, phone, role, status, kyc_status, created_at FROM users WHERE is_deleted = 0`;
    const params: any[] = [];
    if (search) { sql += ` AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (role) { sql += ` AND role = ?`; params.push(role); }
    sql += ` ORDER BY created_at DESC LIMIT 500`;
    return await getDb('auth').prepare(sql).all(...params);
  }

  async setUserStatus(adminId: string, userId: string, status: 'active' | 'suspended' | 'banned') {
    if (userId === adminId) throw new BadRequestException('Cannot change your own status');
    const before = await getDb('auth').prepare(`SELECT id, status FROM users WHERE id = ?`).get(userId) as any;
    if (!before) throw new BadRequestException('User not found');
    await getDb('auth').prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`).run(status, nowUtc(), userId);
    writeAudit('auth', { actor_id: adminId, action: `user.${status}`, entity_type: 'user', entity_id: userId, before_value: before, after_value: { status } });
    await this.notifier.notify(userId, 'account', `Account ${status}`, `Your account has been set to "${status}" by the platform.`, adminId);
    return { message: `User is now ${status}` };
  }

  // ---------- Task 1.3: car approval queue ----------
  async carApprovalQueue() {
    const rows = await getDb('fleet').prepare(
      `SELECT * FROM cars WHERE status = 'pending_review' AND is_deleted = 0 ORDER BY updated_at ASC`,
    ).all() as any[];
    return await Promise.all(rows.map(async (car) => ({
      ...car,
      photos: await getDb('fleet').prepare(`SELECT file_url FROM car_photos WHERE car_id = ? AND is_deleted = 0 ORDER BY sort_order`).all(car.id),
      documents: await getDb('fleet').prepare(`SELECT doc_type, file_url FROM car_documents WHERE car_id = ? AND is_deleted = 0`).all(car.id),
      pricing_missing: (await getDb('fleet').prepare(`SELECT daily_rate_paise FROM car_pricing WHERE car_id = ?`).get(car.id) as any)?.daily_rate_paise === undefined,
      verification: await this.carVerify.latest(car.id),
    })));
  }

  async verifyCar(adminId: string, carId: string) {
    return await this.carVerify.verify({ id: adminId, role: 'super_admin' }, carId);
  }

  async overrideCarVerification(adminId: string, carId: string, reason: string) {
    return await this.carVerify.verifyManualOverride({ id: adminId, role: 'super_admin' }, carId, reason);
  }

  async verificationConfig() {
    return await this.carVerify.config();
  }

  async decideCar(adminId: string, carId: string, decision: 'approve' | 'reject', reason?: string) {
    const db = getDb('fleet');
    const car = await db.prepare(`SELECT * FROM cars WHERE id = ? AND is_deleted = 0`).get(carId) as any;
    if (!car || car.status !== 'pending_review') throw new BadRequestException('Car not pending review');
    if (decision === 'reject' && !reason) throw new BadRequestException('Rejection reason is mandatory');
    if (decision === 'approve') {
      // Rule 2.3: cannot activate without daily_rate
      if (await this.fleet.ownerDailyRateMissing(carId)) throw new BadRequestException('Owner must set a daily rate first');
    }
    await db.prepare(`UPDATE cars SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ?`)
      .run(decision === 'approve' ? 'active' : 'rejected', decision === 'reject' ? reason : null, nowUtc(), carId);
    await this.fleet.syncCarCache();
    writeAudit('fleet', {
      actor_id: adminId, action: `car.${decision}d`, entity_type: 'car', entity_id: carId,
      before_value: { status: 'pending_review' }, after_value: { status: decision === 'approve' ? 'active' : 'rejected', reason },
    });
    await this.notifier.notify(car.owner_id, 'car',
      decision === 'approve' ? 'Car approved!' : `Car rejected`,
      decision === 'approve' ? `${car.make} ${car.model} is now live.` : `Reason: ${reason}`, adminId);
    return { message: `Car ${decision}d` };
  }

  // ---------- Task 2.1: settings ----------
  async settings() { return await this.payments.listSettings(); }
  async updateSetting(adminId: string, key: string, valueInt: number) {
    return await this.payments.setSetting(adminId, key, valueInt);
  }

  // ---------- Task 2.2: payouts ----------
  async payouts(status?: string) { return await this.payments.listPayoutsForAdmin(status); }

  async approvePayout(adminId: string, payoutId: string) {
    const r = await this.payments.decidePayout(adminId, payoutId, 'approve');
    const p = await getDb('payment').prepare(`SELECT * FROM payouts WHERE id = ?`).get(payoutId) as any;
    await this.notifier.notify(p.user_id, 'payout', 'Payout approved', 'Your payout was approved and will be paid out.', adminId);
    return r;
  }
  async rejectPayout(adminId: string, payoutId: string, reason: string) {
    return await this.payments.decidePayout(adminId, payoutId, 'reject', reason);
  }
  async markPaid(adminId: string, payoutId: string) {
    return await this.payments.markPayoutPaid(adminId, payoutId);
  }

  // ---------- Task 2.3: disputes ----------
  async openDisputes() { return await this.bookings.openDisputes(); }
  async allDisputes() { return await this.bookings.allDisputes(); }
  async resolveDispute(adminId: string, disputeId: string, resolution: any) {
    return await this.bookings.resolveDispute(adminId, disputeId, resolution);
  }

  // ---------- Role change requests ----------
  async listRoleChangeRequests(status?: string) {
    const adb = getDb('auth');
    const rows = status
      ? await adb.prepare(`SELECT * FROM role_change_requests WHERE status = ? ORDER BY created_at ASC`).all(status)
      : await adb.prepare(`SELECT * FROM role_change_requests ORDER BY created_at DESC LIMIT 200`).all();
    return await Promise.all(rows.map(async (r: any) => {
      const u = await adb.prepare(`SELECT name, email, role FROM users WHERE id = ?`).get(r.user_id) as any;
      return { ...r, user_name: u?.name, user_email: u?.email, current_role_now: u?.role };
    }));
  }

  async decideRoleChange(adminId: string, requestId: string, decision: 'approve' | 'reject') {
    const r = await getDb('auth').prepare(`SELECT * FROM role_change_requests WHERE id = ?`).get(requestId) as any;
    if (!r) throw new BadRequestException('Request not found');
    const result = await this.auth.decideRoleChange(adminId, requestId, decision);
    await this.notifier.notify(r.user_id, 'account', `Role change ${decision}d`,
      decision === 'approve' ? `Your role is now ${r.desired_role}.` : 'Your role change request was rejected.', adminId);
    return result;
  }

  // ---------- Agents management ----------
  async listAgents() {
    const adb = getDb('agent');
    const rows = await adb.prepare(`SELECT * FROM agents WHERE is_deleted = 0`).all() as any[];
    const authDb = getDb('auth');
    return await Promise.all(rows.map(async (a) => {
      const u = await authDb.prepare(`SELECT name, email, phone, status FROM users WHERE id = ?`).get(a.user_id) as any;
      return { ...a, name: u?.name, email: u?.email, phone: u?.phone };
    }));
  }

  async setAgentSalary(adminId: string, agentUserId: string, salaryPaise: number) {
    const db = getDb('agent');
    let profile = await db.prepare(`SELECT * FROM agents WHERE user_id = ?`).get(agentUserId) as any;
    if (!profile) {
      await db.prepare(`INSERT INTO agents (id, user_id, monthly_salary_paise, created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?)`).run(uuid(), agentUserId, salaryPaise, nowUtc(), nowUtc(), adminId);
    } else {
      writeAudit('agent', { actor_id: adminId, action: 'agent.salary_set', entity_type: 'agent', entity_id: agentUserId, before_value: profile, after_value: { monthly_salary_paise: salaryPaise } });
      await db.prepare(`UPDATE agents SET monthly_salary_paise = ?, updated_at = ? WHERE user_id = ?`).run(salaryPaise, nowUtc(), agentUserId);
    }
    return { message: 'Salary saved' };
  }

  async assignLead(adminId: string, agentUserId: string, leadUserId: string, type: string) {
    const db = getDb('agent');
    await db.prepare(
      `INSERT INTO agent_assignments (id, agent_user_id, assignment_type, lead_user_id, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, 'assigned', ?, ?, ?)`,
    ).run(uuid(), agentUserId, type, leadUserId, nowUtc(), nowUtc(), adminId);
    return { message: 'Assignment created' };
  }

  // ---------- Task 3.1: CSV reports ----------
  async reportCsv(kind: 'bookings' | 'revenue' | 'subscriptions', from?: string, to?: string): Promise<string> {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    if (kind === 'bookings') {
      const rows = await this.bookings.allBookingsFiltered(from, to);
      const head = ['id', 'car_id', 'renter_id', 'owner_id', 'start_date', 'end_date', 'status', 'total_amount_paise', 'online_paid_paise', 'late_fee_paise', 'created_at'];
      return [head.join(','), ...rows.map((r: any) => head.map((h) => esc(r[h])).join(','))].join('\n');
    }
    if (kind === 'revenue') {
      const rows = await (await getDb('payment').prepare(
        `SELECT * FROM transactions ORDER BY created_at DESC`,
      ).all()).filter((t: any) => (!from || t.created_at >= from) && (!to || t.created_at <= to));
      const head = ['id', 'booking_id', 'payer_id', 'payee_id', 'amount_paise', 'type', 'method', 'status', 'created_at'];
      return [head.join(','), ...rows.map((r: any) => head.map((h) => esc(r[h])).join(','))].join('\n');
    }
    const rows = await (await getDb('payment').prepare(
      `SELECT * FROM subscriptions ORDER BY created_at DESC`,
    ).all()).filter((s: any) => (!from || s.created_at >= from) && (!to || s.created_at <= to));
    const head = ['id', 'user_id', 'plan', 'price_paid_paise', 'period_start', 'period_end', 'status', 'created_at'];
    return [head.join(','), ...rows.map((r: any) => head.map((h) => esc(r[h])).join(','))].join('\n');
  }
}
