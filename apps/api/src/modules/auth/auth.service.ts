import { createHash } from 'crypto';
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

  /**
   * Refresh tokens are hashed with SHA-256 rather than bcrypt — see
   * migrations/auth/003_refresh_token_sha256.sql. A refresh token is ~244 bits
   * of randomness, so there is nothing worth brute-forcing, and unlike bcrypt
   * this is deterministic, which is what lets refresh() do one indexed lookup
   * instead of an O(N) bcrypt scan that blocks the event loop for the whole
   * request.
   */
  private hashToken(v: string) {
    return createHash('sha256').update(v).digest('hex');
  }

  private signAccess(userId: string, role: string) {
    return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: ACCESS_TTL_SEC });
  }

  private async issueTokens(user: { id: string; role: string }) {
    const db = getDb('auth');
    // Housekeeping on a path that already writes: expired sessions can never
    // be redeemed again, so keep them from accumulating. Lookup is indexed, so
    // this is about table hygiene, not correctness.
    await db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(nowUtc());
    const refreshToken = uuid() + '.' + uuid();
    await db.prepare(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuid(), user.id, this.hashToken(refreshToken),
      new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString(),
      nowUtc(), nowUtc(), user.id,
    );
    return { access_token: this.signAccess(user.id, user.role), refresh_token: refreshToken };
  }

  private async createOtp(userId: string, purpose: 'phone_verify' | 'admin_2fa' | 'password_reset'): Promise<string> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (purpose === 'password_reset') {
      // long random token emailed as link instead of a numeric code
      const token = require('crypto').randomBytes(24).toString('hex');
      await getDb('auth').prepare(
        `INSERT INTO otp_verifications (id, user_id, purpose, code_hash, expires_at, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(uuid(), userId, purpose, this.hash(token), new Date(Date.now() + RESET_TTL_SEC * 1000).toISOString(), nowUtc(), nowUtc(), userId);
      return token;
    }
    await getDb('auth').prepare(
      `INSERT INTO otp_verifications (id, user_id, purpose, code_hash, expires_at, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid(), userId, purpose, this.hash(code), new Date(Date.now() + OTP_TTL_SEC * 1000).toISOString(), nowUtc(), nowUtc(), userId);
    return code;
  }

  private async consumeOtp(userId: string, purpose: string, code: string): Promise<boolean> {
    const db = getDb('auth');
    const rows = await db.prepare(
      `SELECT * FROM otp_verifications WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 3`,
    ).all(userId, purpose) as any[];
    for (const row of rows) {
      if (new Date(row.expires_at) < new Date()) continue;
      if (this.compare(code, row.code_hash)) {
        await db.prepare(`UPDATE otp_verifications SET consumed_at = ?, updated_at = ? WHERE id = ?`).run(nowUtc(), nowUtc(), row.id);
        return true;
      }
    }
    return false;
  }

  async signup(dto: { name: string; email: string; phone: string; password: string; role: string }) {
    if (dto.role === 'super_admin') throw new BadRequestException('Invalid role');
    const db = getDb('auth');
    const exists = await db.prepare(`SELECT id FROM users WHERE email = ? OR phone = ?`).get(dto.email, dto.phone);
    if (exists) throw new BadRequestException('An account with this email or phone already exists');
    const id = uuid();
    await db.prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_otp', ?, ?, ?)`,
    ).run(id, dto.name, dto.email.toLowerCase(), dto.phone, this.hash(dto.password), dto.role, nowUtc(), nowUtc(), id);

    const code = await this.createOtp(id, 'phone_verify');
    await this.notifier.sendSms(dto.phone, `Your CarRental verification code is ${code}`);
    return {
      user_id: id,
      message: 'Account created. Verify your phone with the OTP sent via SMS.',
      dev_otp: process.env.NODE_ENV !== 'production' ? code : undefined,
    };
  }

  private async loginWithPortal(email: string, password: string, portal: Portal) {
    const db = getDb('auth');
    const user = await db.prepare(`SELECT * FROM users WHERE email = ? AND is_deleted = 0`).get(email.toLowerCase()) as any;
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
      const twofaToken = await this.create2faChallenge(user.id);
      return { requires_2fa: true as const, twofa_token: twofaToken };
    }
    return { ...await this.issueTokens(user), user: this.toPublicUser(user) };
  }

  async loginMain(email: string, password: string) { return await this.loginWithPortal(email, password, 'main'); }
  async loginAgent(email: string, password: string) { return await this.loginWithPortal(email, password, 'agent'); }
  async loginAdmin(email: string, password: string) { return await this.loginWithPortal(email, password, 'admin'); }

  private async create2faChallenge(userId: string): Promise<string> {
    const challenge = jwt.sign({ sub: userId, scope: '2fa' }, JWT_SECRET, { expiresIn: 300 });
    const code = await this.createOtp(userId, 'admin_2fa');
    const u = await this.getUserRaw(userId);
    await this.notifier.sendSms(u.phone, `Your admin login verification code is ${code}. Expires in 10 min.`);
    return challenge;
  }

  async verifyAdmin2fa(twofaToken: string, code: string) {
    let payload: any;
    try {
      payload = jwt.verify(twofaToken, JWT_SECRET);
    } catch {
      throw new UnauthorizedException('2FA session expired, login again');
    }
    if (payload.scope !== '2fa') throw new UnauthorizedException('Bad 2FA session');
    const user = await this.getUserRaw(payload.sub);
    if (user.role !== 'super_admin') throw new UnauthorizedException('Invalid credentials for this portal');
    if (!await this.consumeOtp(user.id, 'admin_2fa', code)) throw new UnauthorizedException('Incorrect verification code');
    return { ...await this.issueTokens(user), user: this.toPublicUser(user) };
  }

  async requestPhoneOtp(userId: string) {
    const user = await this.getUserRaw(userId);
    if (user.status === 'active') throw new BadRequestException('Phone already verified');
    const code = await this.createOtp(userId, 'phone_verify');
    await this.notifier.sendSms(user.phone, `Your CarRental verification code is ${code}`);
    return { message: 'OTP sent', dev_otp: process.env.NODE_ENV !== 'production' ? code : undefined };
  }

  async verifyPhoneOtp(userId: string, code: string) {
    if (!await this.consumeOtp(userId, 'phone_verify', code)) throw new UnauthorizedException('Incorrect or expired OTP');
    await getDb('auth').prepare(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ?`).run(nowUtc(), userId);
    return { message: 'Phone verified. Account active.' };
  }

  async forgotPassword(email: string) {
    const db = getDb('auth');
    const user = await db.prepare(`SELECT * FROM users WHERE email = ? AND is_deleted = 0`).get(email.toLowerCase()) as any;
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };
    const token = await this.createOtp(user.id, 'password_reset');
    await this.notifier.sendEmail(
      user.email,
      'Password reset',
      `Reset your password with this link (valid 15 minutes): /reset-password?token=${token}`,
    );
    return {
      message: 'If that email exists, a reset link has been sent.',
      dev_token: process.env.NODE_ENV !== 'production' ? token : undefined,
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const db = getDb('auth');
    const rows = await db.prepare(
      `SELECT * FROM otp_verifications WHERE purpose = 'password_reset' AND consumed_at IS NULL`,
    ).all() as any[];
    let match: any = null;
    for (const row of rows) {
      if (new Date(row.expires_at) < new Date()) continue;
      if (this.compare(token, row.code_hash)) { match = row; break; }
    }
    if (!match) throw new UnauthorizedException('Invalid or expired reset token');
    await db.prepare(`UPDATE otp_verifications SET consumed_at = ?, updated_at = ? WHERE id = ?`).run(nowUtc(), nowUtc(), match.id);
    await db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(this.hash(newPassword), nowUtc(), match.user_id);
    return { message: 'Password updated. You can log in now.' };
  }

  /**
   * Age is derived, never stored (see migration 004). Recomputed per read so
   * it cannot drift, and clamped at 0 because a timezone boundary can put the
   * birthday one day either side of the local clock.
   */
  private ageFrom(dateOfBirth: string | null): number | null {
    if (!dateOfBirth) return null;
    const dob = new Date(`${dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(dob.getTime())) return null;
    const years = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    return Math.max(0, Math.floor(years));
  }

  toPublicUser(u: any) {
    return {
      id: u.id, name: u.name, email: u.email, phone: u.phone,
      role: u.role, status: u.status, kyc_status: u.kyc_status,
      date_of_birth: u.date_of_birth ?? null,
      age: this.ageFrom(u.date_of_birth),
      gender: u.gender ?? null,
      address_line: u.address_line ?? null,
      city: u.city ?? null,
      state: u.state ?? null,
      pincode: u.pincode ?? null,
      profile_completed: !!u.profile_completed_at,
    };
  }

  async getUserRaw(id: string): Promise<any> {
    return await getDb('auth').prepare(`SELECT * FROM users WHERE id = ? AND is_deleted = 0`).get(id);
  }

  /**
   * Self-service profile edits, deliberately narrow: name and phone only.
   * Role, KYC status and account status are not things a user may set on
   * themselves. Phone is re-checked against the same uniqueness rule signup
   * uses because it doubles as a login credential.
   */
  async updateProfile(
    userId: string,
    patch: {
      name?: string;
      phone?: string;
      date_of_birth?: string;
      gender?: string;
      address_line?: string;
      city?: string;
      state?: string;
      pincode?: string;
    },
  ) {
    const db = getDb('auth');
    const user = await this.getUserRaw(userId);
    if (!user) throw new BadRequestException('User not found');

    const name = patch.name ?? user.name;
    const phone = patch.phone ?? user.phone;

    if (phone !== user.phone) {
      const clash = await db
        .prepare(`SELECT id FROM users WHERE phone = ? AND id <> ? AND is_deleted = 0`)
        .get(phone, userId);
      if (clash) throw new BadRequestException('That phone number is already in use');
    }

    // Nullish coalescing, not truthiness: an empty string from a cleared form
    // field is a real edit and must overwrite the stored value, otherwise
    // "clear my city" silently does nothing.
    const next = {
      date_of_birth: patch.date_of_birth ?? user.date_of_birth ?? null,
      gender: patch.gender ?? user.gender ?? null,
      address_line: patch.address_line ?? user.address_line ?? null,
      city: patch.city ?? user.city ?? null,
      state: patch.state ?? user.state ?? null,
      pincode: patch.pincode ?? user.pincode ?? null,
    };

    const PROFILE_FIELDS = [
      'date_of_birth', 'gender', 'address_line', 'city', 'state', 'pincode',
    ] as const;

    // Stamp completion the first time the required set is all present. Once
    // set it is never cleared, so a user who later blanks a field is not
    // re-prompted forever; the onboarding form is a nudge, not a gate.
    const requiredPresent = !!next.date_of_birth && !!next.gender && !!next.city && !!next.state && !!next.pincode;
    const profileCompletedAt = user.profile_completed_at ?? (requiredPresent ? nowUtc() : null);

    const before = {
      name: user.name, phone: user.phone,
      ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f, user[f] ?? null])),
    };
    const after = { name, phone, ...next };
    const unchanged =
      PROFILE_FIELDS.every((f) => (user[f] ?? null) === (next[f] ?? null)) &&
      before.name === after.name &&
      before.phone === after.phone;

    if (unchanged) {
      return { user: this.toPublicUser(user), changed: false };
    }

    await db.prepare(
      `UPDATE users SET name = ?, phone = ?, date_of_birth = ?, gender = ?, address_line = ?,
         city = ?, state = ?, pincode = ?, profile_completed_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      name, phone, next.date_of_birth, next.gender, next.address_line,
      next.city, next.state, next.pincode, profileCompletedAt, nowUtc(), userId,
    );

    writeAudit('auth', {
      actor_id: userId, action: 'profile.updated', entity_type: 'user', entity_id: userId,
      before_value: before, after_value: { ...after, profile_completed_at: profileCompletedAt },
    });

    return { user: this.toPublicUser(await this.getUserRaw(userId)), changed: true };
  }

  // ---------- Role change requests (spec Task 1.3: role fixed at signup, changes need SA approval) ----------
  async requestRoleChange(userId: string, desiredRole: string) {
    const db = getDb('auth');
    if (!['car_owner', 'car_renter', 'agent'].includes(desiredRole)) {
      throw new BadRequestException('Invalid role');
    }
    const user = await this.getUserRaw(userId);
    if (user.role === desiredRole) throw new BadRequestException('You already have this role');
    const open = await db.prepare(
      `SELECT id FROM role_change_requests WHERE user_id = ? AND status = 'pending'`,
    ).get(userId);
    if (open) throw new BadRequestException('You already have a pending role change request');
    const id = uuid();
    await db.prepare(
      `INSERT INTO role_change_requests (id, user_id, "current_role", desired_role, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(id, userId, user.role, desiredRole, nowUtc(), nowUtc(), userId);
    return { request_id: id, message: 'Request submitted. Super Admin will review it.' };
  }

  async myRoleChangeRequests(userId: string) {
    return await getDb('auth').prepare(
      `SELECT * FROM role_change_requests WHERE user_id = ? ORDER BY created_at DESC`,
    ).all(userId);
  }

  async listRoleChangeRequests(status?: string) {
    return status
      ? await getDb('auth').prepare(`SELECT * FROM role_change_requests WHERE status = ? ORDER BY created_at ASC`).all(status)
      : await getDb('auth').prepare(`SELECT * FROM role_change_requests ORDER BY created_at DESC LIMIT 200`).all();
  }

  async decideRoleChange(adminId: string, requestId: string, decision: 'approve' | 'reject') {
    const db = getDb('auth');
    const req = await db.prepare(`SELECT * FROM role_change_requests WHERE id = ?`).get(requestId) as any;
    if (!req) throw new UnauthorizedException('Request not found');
    if (req.status !== 'pending') throw new BadRequestException('Already decided');
    await db.prepare(`UPDATE role_change_requests SET status = ?, decided_by = ?, updated_at = ? WHERE id = ?`)
      .run(decision === 'approve' ? 'approved' : 'rejected', adminId, nowUtc(), requestId);
    if (decision === 'approve') {
      const before = { role: req.current_role };
      await db.prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`).run(req.desired_role, nowUtc(), req.user_id);
      writeAudit('auth', {
        actor_id: adminId, action: 'role_change.approved', entity_type: 'user', entity_id: req.user_id,
        before_value: before, after_value: { role: req.desired_role },
      });
    }
    return { message: `Role change ${decision}d` };
  }

  async refresh(refreshToken: string) {
    const db = getDb('auth');
    // One indexed lookup — see hashToken() and migration 003. This used to
    // select every non-revoked session and bcrypt-compare each one until a hit;
    // at 83 rows that measured ~12s of blocked event loop, and the refreshes
    // racing alongside it queued behind that only to find the session already
    // revoked by the winner.
    const session = await db
      .prepare(
        `SELECT * FROM sessions
          WHERE refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
      )
      .get(this.hashToken(refreshToken), nowUtc()) as any;
    if (!session) throw new UnauthorizedException('Refresh token invalid or expired');
    await db.prepare(`UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE id = ?`).run(nowUtc(), nowUtc(), session.id);
    const user = await this.getUserRaw(session.user_id);
    return await this.issueTokens(user);
  }
}
