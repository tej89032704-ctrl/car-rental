import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AgentsService {
  private adb() { return getDb('agent'); }

  constructor(private auth: AuthService) {}

  ensureProfile(userId: string) {
    const db = this.adb();
    let profile = db.prepare(`SELECT * FROM agents WHERE user_id = ?`).get(userId) as any;
    if (!profile) {
      db.prepare(
        `INSERT INTO agents (id, user_id, monthly_salary_paise, region, created_at, updated_at, created_by)
         VALUES (?, ?, ?, '', ?, ?, ?)`,
      ).run(uuid(), userId, 0, nowUtc(), nowUtc(), userId);
      profile = db.prepare(`SELECT * FROM agents WHERE user_id = ?`).get(userId);
    }
    return profile;
  }

  /**
   * Task 1.2: Agent creates a lead -> pending user account is created that the
   * actual person must confirm via OTP before it becomes real.
   */
  createLead(agentUserId: string, dto: {
    lead_name: string; lead_phone: string; lead_email: string; lead_type: 'owner_onboarding' | 'renter_onboarding';
  }) {
    const role = dto.lead_type === 'owner_onboarding' ? 'car_owner' : 'car_renter';
    // creates the pending account (status=pending_otp, OTP SMS sent)
    const result = this.auth.signup({
      name: dto.lead_name, email: dto.lead_email, phone: dto.lead_phone,
      password: require('crypto').randomBytes(12).toString('base64url'), role,
    });
    const userId = result.user_id;

    const leadId = uuid();
    this.adb().prepare(
      `INSERT INTO onboarding_leads (id, agent_user_id, lead_name, lead_phone, lead_email, lead_type, converted_user_id, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'otp_pending', ?, ?, ?)`,
    ).run(leadId, agentUserId, dto.lead_name, dto.lead_phone, dto.lead_email, dto.lead_type, userId, nowUtc(), nowUtc(), agentUserId);

    // auto-assign KYC first-pass to this agent
    this.adb().prepare(
      `INSERT INTO agent_assignments (id, agent_user_id, assignment_type, lead_user_id, status, note, created_at, updated_at, created_by)
       VALUES (?, ?, 'kyc_first_pass', ?, 'assigned', 'Lead onboarded by agent', ?, ?, ?)`,
    ).run(uuid(), agentUserId, userId, nowUtc(), nowUtc(), agentUserId);

    return { lead_id: leadId, user_id: userId, message: 'Lead created. The person must verify their phone via OTP to activate.', dev_otp: result.dev_otp };
  }

  myLeads(agentUserId: string) {
    const rows = this.adb().prepare(
      `SELECT * FROM onboarding_leads WHERE agent_user_id = ? AND is_deleted = 0 ORDER BY created_at DESC`,
    ).all(agentUserId) as any[];
    const adb = getDb('auth');
    return rows.map((l) => {
      const u = l.converted_user_id
        ? adb.prepare(`SELECT status, kyc_status FROM users WHERE id = ?`).get(l.converted_user_id) as any
        : null;
      return { ...l, account_status: u?.status ?? 'not_activated', account_kyc_status: u?.kyc_status ?? '-' };
    });
  }

  myAssignments(agentUserId: string) {
    const rows = this.adb().prepare(
      `SELECT * FROM agent_assignments WHERE agent_user_id = ? ORDER BY created_at DESC`,
    ).all(agentUserId) as any[];
    const adb = getDb('auth');
    return rows.map((a) => {
      const u = adb.prepare(`SELECT name, email, role, kyc_status FROM users WHERE id = ?`).get(a.lead_user_id) as any;
      return { ...a, lead_name: u?.name, lead_email: u?.email, lead_role: u?.role, lead_kyc_status: u?.kyc_status };
    });
  }

  /** Agent earnings view under salary model: no commission ledger, just employment info */
  dashboard(agentUserId: string) {
    const profile = this.ensureProfile(agentUserId);
    return {
      employment: profile,
      leads: this.myLeadsSummary(agentUserId),
      assignments_open: this.myAssignments(agentUserId).filter((a) => a.status === 'assigned'),
      note: 'Agents are salaried - issue handling only, no commission.',
    };
  }

  private myLeadsSummary(agentUserId: string) {
    return this.adb().prepare(
      `SELECT lead_type, status, COUNT(*) AS count FROM onboarding_leads
       WHERE agent_user_id = ? AND is_deleted = 0 GROUP BY lead_type, status`,
    ).all(agentUserId);
  }
}
