import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { JWT_SECRET } from '../../common/auth/guards';
import { writeAudit } from '../../common/audit/audit';
import { NotificationsService } from '../notifications/notifications.service';

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;
const OTP_TTL_SEC = 10 * 60;
const RESET_TTL_SEC = 15 * 60;

export type Portal = 'main' | 'admin' | 'agent';
const PORTAL_ROLES: Record<Portal, string[]> = {
  main: ['car_owner', 'car_renter'],
  admin: ['super_admin'],
  agent: ['agent'],
};

@Injectable()
export class AuthService {
  constructor(private readonly notifier: NotificationsService) {}

  private hash(v: string) {
    return bcrypt.hashSync(v, 10);
  }
  private compare(v: string, h: string) {
    return bcrypt.compareSync(v, h);
  }

  private signAccess(userId: string, role: string) {
    return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: ACCESS_TTL_SEC });
  }

  private issueTokens(user: { id: string; role: string }) {
    const db = getDb('auth');
    const refreshToken = uuid() + '.' + uuid();
    db.prepare(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuid(), user.id, this.hash(refreshToken),
      new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString(),
      nowUtc(), nowUtc(), user.id,
    );
    return { access_token: this.signAccess(user.id, user.role), refresh_token: refreshToken };
  }

  private createOtp(userId: string, purpose: 'phone_verify' | 'admin_2fa' | 'password_reset'): string {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (purpose === 'password_reset') {
      // long random token emailed as link instead of a numeric code
      const token = require('crypto').randomBytes(24).toString('hex');
      getDb('auth').prepare(
        `INSERT INTO otp_verifications (id, user_id, purpose, code_hash, expires_at, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(uuid(), userId, purpose, this.hash(token), new Date(Date.now() + RESET_TTL_SEC * 1000).toISOString(), nowUtc(), nowUtc(), userId);
      return token;
    }
    getDb('auth').prepare(
      `INSERT INTO otp_verifications (id, user_id, purpose, code_hash, expires_at, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid(), userId, purpose, this.hash(code), new Date(Date.now() + OTP_TTL_SEC * 1000).toISOString(), nowUtc(), nowUtc(), userId);
    return code;
  }

  private consumeOtp(userId: string, purpose: string, code: string): boolean {
    const db = getDb('auth');
    const rows = db.prepare(
      `SELECT * FROM otp_verifications WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 3`,
    ).all(userId, purpose) as any[];
    for (const row of rows) {
      if (new Date(row.expires_at) < new Date()) continue;
      if (this.compare(code, row.code_hash)) {
        db.prepare(`UPDATE otp_verifications SET consumed_at = ?, updated_at = ? WHERE id = ?`).run(nowUtc(), nowUtc(), row.id);
        return true;
      }
    }
    return false;
  }

  signup(dto: { name: string; email: string; phone: string; password: string; role: string }) {
    if (dto.role === 'super_admin') throw new BadRequestException('Invalid role');
    const db = getDb('auth');
    const exists = db.prepare(`SELECT id FROM users WHERE email = ? OR phone = ?`).get(dto.email, dto.phone);
    if (exists) throw new BadRequestException('An account with this email or phone already exists');
    const id = uuid();
    db.prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_otp', ?, ?, ?)`,
    ).run(id, dto.name, dto.email.toLowerCase(), dto.phone, this.hash(dto.password), dto.role, nowUtc(), nowUtc(), id);

    const code = this.createOtp(id, 'phone_verify');
    this.notifier.sendSms(dto.phone, `Your CarRental verification code is ${code}`);
    return {
      user_id: id,
      message: 'Account created. Verify your phone with the OTP sent via SMS.',
      dev_otp: process.env.NODE_ENV !== 'production' ? code : undefined,
    };
  }

  private loginWithPortal(email: string, password: string, portal: Portal) {
    const db = getDb('auth');
    const user = db.prepare(`SELECT * FROM users WHERE email = ? AND is_deleted = 0`).get(email.toLowerCase()) as any;
    const genericError = new UnauthorizedException('Invalid credentials for this portal');
    if (!user || !this.compare(password, user.password_hash)) throw genericError;

    const allowed = PORTAL_ROLES[portal];
    if (!allowed.includes(user.role)) {
      // do not leak which portal the account belongs to
      throw genericError;
    }
    if (user.status === 'banned' || user.status === 'suspended') {
      throw new ForbiddenException(`Account ${user.status}. Contact support.`);
    }
    if (user.role === 'super_admin') {
      const twofaToken = this.create2faChallenge(user.id);
      return { requires_2fa: true as const, twofa_token: twofaToken };
    }
    return { ...this.issueTokens(user), user: this.toPublicUser(user) };
  }

  loginMain(email: string, password: string) { return this.loginWithPortal(email, password, 'main'); }
  loginAgent(email: string, password: string) { return this.loginWithPortal(email, password, 'agent'); }
  loginAdmin(email: string, password: string) { return this.loginWithPortal(email, password, 'admin'); }

  private create2faChallenge(userId: string): string {
    const challenge = jwt.sign({ sub: userId, scope: '2fa' }, JWT_SECRET, { expiresIn: 300 });
    const code = this.createOtp(userId, 'admin_2fa');
    const u = this.getUserRaw(userId);
    this.notifier.sendSms(u.phone, `Your admin login verification code is ${code}. Expires in 10 min.`);
    return challenge;
  }

  verifyAdmin2fa(twofaToken: string, code: string) {
    let payload: any;
    try {
      payload = jwt.verify(twofaToken, JWT_SECRET);
    } catch {
      throw new UnauthorizedException('2FA session expired, login again');
    }
    if (payload.scope !== '2fa') throw new UnauthorizedException('Bad 2FA session');
    const user = this.getUserRaw(payload.sub);
    if (user.role !== 'super_admin') throw new UnauthorizedException('Invalid credentials for this portal');
    if (!this.consumeOtp(user.id, 'admin_2fa', code)) throw new UnauthorizedException('Incorrect verification code');
    return { ...this.issueTokens(user), user: this.toPublicUser(user) };
  }

  requestPhoneOtp(userId: string) {
    const user = this.getUserRaw(userId);
    if (user.status === 'active') throw new BadRequestException('Phone already verified');
    const code = this.createOtp(userId, 'phone_verify');
    this.notifier.sendSms(user.phone, `Your CarRental verification code is ${code}`);
    return { message: 'OTP sent', dev_otp: process.env.NODE_ENV !== 'production' ? code : undefined };
  }

  verifyPhoneOtp(userId: string, code: string) {
    if (!this.consumeOtp(userId, 'phone_verify', code)) throw new UnauthorizedException('Incorrect or expired OTP');
    getDb('auth').prepare(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ?`).run(nowUtc(), userId);
    return { message: 'Phone verified. Account active.' };
  }

  forgotPassword(email: string) {
    const db = getDb('auth');
    const user = db.prepare(`SELECT * FROM users WHERE email = ? AND is_deleted = 0`).get(email.toLowerCase()) as any;
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };
    const token = this.createOtp(user.id, 'password_reset');
    this.notifier.sendEmail(
      user.email,
      'Password reset',
      `Reset your password with this link (valid 15 minutes): /reset-password?token=${token}`,
    );
    return {
      message: 'If that email exists, a reset link has been sent.',
      dev_token: process.env.NODE_ENV !== 'production' ? token : undefined,
    };
  }

  resetPassword(token: string, newPassword: string) {
    const db = getDb('auth');
    const rows = db.prepare(
      `SELECT * FROM otp_verifications WHERE purpose = 'password_reset' AND consumed_at IS NULL`,
    ).all() as any[];
    let match: any = null;
    for (const row of rows) {
      if (new Date(row.expires_at) < new Date()) continue;
      if (this.compare(token, row.code_hash)) { match = row; break; }
    }
    if (!match) throw new UnauthorizedException('Invalid or expired reset token');
    db.prepare(`UPDATE otp_verifications SET consumed_at = ?, updated_at = ? WHERE id = ?`).run(nowUtc(), nowUtc(), match.id);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(this.hash(newPassword), nowUtc(), match.user_id);
    return { message: 'Password updated. You can log in now.' };
  }

  toPublicUser(u: any) {
    return {
      id: u.id, name: u.name, email: u.email, phone: u.phone,
      role: u.role, status: u.status, kyc_status: u.kyc_status,
    };
  }

  getUserRaw(id: string): any {
    return getDb('auth').prepare(`SELECT * FROM users WHERE id = ? AND is_deleted = 0`).get(id);
  }

  // ---------- Role change requests (spec Task 1.3: role fixed at signup, changes need SA approval) ----------
  requestRoleChange(userId: string, desiredRole: string) {
    const db = getDb('auth');
    if (!['car_owner', 'car_renter', 'agent'].includes(desiredRole)) {
      throw new BadRequestException('Invalid role');
    }
    const user = this.getUserRaw(userId);
    if (user.role === desiredRole) throw new BadRequestException('You already have this role');
    const open = db.prepare(
      `SELECT id FROM role_change_requests WHERE user_id = ? AND status = 'pending'`,
    ).get(userId);
    if (open) throw new BadRequestException('You already have a pending role change request');
    const id = uuid();
    db.prepare(
      `INSERT INTO role_change_requests (id, user_id, current_role, desired_role, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(id, userId, user.role, desiredRole, nowUtc(), nowUtc(), userId);
    return { request_id: id, message: 'Request submitted. Super Admin will review it.' };
  }

  myRoleChangeRequests(userId: string) {
    return getDb('auth').prepare(
      `SELECT * FROM role_change_requests WHERE user_id = ? ORDER BY created_at DESC`,
    ).all(userId);
  }

  listRoleChangeRequests(status?: string) {
    return status
      ? getDb('auth').prepare(`SELECT * FROM role_change_requests WHERE status = ? ORDER BY created_at ASC`).all(status)
      : getDb('auth').prepare(`SELECT * FROM role_change_requests ORDER BY created_at DESC LIMIT 200`).all();
  }

  decideRoleChange(adminId: string, requestId: string, decision: 'approve' | 'reject') {
    const db = getDb('auth');
    const req = db.prepare(`SELECT * FROM role_change_requests WHERE id = ?`).get(requestId) as any;
    if (!req) throw new UnauthorizedException('Request not found');
    if (req.status !== 'pending') throw new BadRequestException('Already decided');
    db.prepare(`UPDATE role_change_requests SET status = ?, decided_by = ?, updated_at = ? WHERE id = ?`)
      .run(decision === 'approve' ? 'approved' : 'rejected', adminId, nowUtc(), requestId);
    if (decision === 'approve') {
      const before = { role: req.current_role };
      db.prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`).run(req.desired_role, nowUtc(), req.user_id);
      writeAudit('auth', {
        actor_id: adminId, action: 'role_change.approved', entity_type: 'user', entity_id: req.user_id,
        before_value: before, after_value: { role: req.desired_role },
      });
    }
    return { message: `Role change ${decision}d` };
  }

  refresh(refreshToken: string) {
    const db = getDb('auth');
    const sessions = db.prepare(`SELECT * FROM sessions WHERE revoked_at IS NULL`).all() as any[];
    const session = sessions.find((s) => this.compare(refreshToken, s.refresh_token_hash));
    if (!session || new Date(session.expires_at) < new Date()) throw new UnauthorizedException('Refresh token invalid or expired');
    db.prepare(`UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE id = ?`).run(nowUtc(), nowUtc(), session.id);
    const user = this.getUserRaw(session.user_id);
    return this.issueTokens(user);
  }
}
