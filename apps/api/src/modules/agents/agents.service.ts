import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AgentsService {
  private adb() { return getDb('agent'); }

  constructor(private auth: AuthService) {}

  async ensureProfile(userId: string) {
    const db = this.adb();
    let profile = await db.prepare(`SELECT * FROM agents WHERE user_id = ?`).get(userId) as any;
    if (!profile) {
      await db.prepare(
        `INSERT INTO agents (id, user_id, monthly_salary_paise, region, created_at, updated_at, created_by)
         VALUES (?, ?, ?, '', ?, ?, ?)`,
      ).run(uuid(), userId, 0, nowUtc(), nowUtc(), userId);
      profile = await db.prepare(`SELECT * FROM agents WHERE user_id = ?`).get(userId);
    }
    return profile;
  }

  /**
   * Task 1.2: Agent creates a lead -> an account is created for that person.
   * Since registration no longer goes through a phone-OTP step (see
   * AuthService.signup), the lead is converted the moment the account exists.
   */
  async createLead(agentUserId: string, dto: {
    lead_name: string; lead_phone: string; lead_email: string; lead_type: 'owner_onboarding' | 'renter_onboarding';
  }) {
    const role = dto.lead_type === 'owner_onboarding' ? 'car_owner' : 'car_renter';
    // creates the account (status=active) and returns its id
    const result = await this.auth.signup({
      name: dto.lead_name, email: dto.lead_email, phone: dto.lead_phone,
      password: require('crypto').randomBytes(12).toString('base64url'), role,
    });
    const userId = result.user_id;

    const leadId = uuid();
    await this.adb().prepare(
      `INSERT INTO onboarding_leads (id, agent_user_id, lead_name, lead_phone, lead_email, lead_type, converted_user_id, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'converted', ?, ?, ?)`,
    ).run(leadId, agentUserId, dto.lead_name, dto.lead_phone, dto.lead_email, dto.lead_type, userId, nowUtc(), nowUtc(), agentUserId);

    // auto-assign KYC first-pass to this agent
    await this.adb().prepare(
      `INSERT INTO agent_assignments (id, agent_user_id, assignment_type, lead_user_id, status, note, created_at, updated_at, created_by)
       VALUES (?, ?, 'kyc_first_pass', ?, 'assigned', 'Lead onboarded by agent', ?, ?, ?)`,
    ).run(uuid(), agentUserId, userId, nowUtc(), nowUtc(), agentUserId);

    return { lead_id: leadId, user_id: userId, message: 'Lead created. An account is active for this person.' };
  }

  async myLeads(agentUserId: string) {
    const rows = await this.adb().prepare(
      `SELECT * FROM onboarding_leads WHERE agent_user_id = ? AND is_deleted = 0 ORDER BY created_at DESC`,
    ).all(agentUserId) as any[];
    const adb = getDb('auth');
    return await Promise.all(rows.map(async (l) => {
      const u = l.converted_user_id
        ? await adb.prepare(`SELECT status, kyc_status FROM users WHERE id = ?`).get(l.converted_user_id) as any
        : null;
      return { ...l, account_status: u?.status ?? 'not_activated', account_kyc_status: u?.kyc_status ?? '-' };
    }));
  }

  async myAssignments(agentUserId: string) {
    const rows = await this.adb().prepare(
      `SELECT * FROM agent_assignments WHERE agent_user_id = ? ORDER BY created_at DESC`,
    ).all(agentUserId) as any[];
    const adb = getDb('auth');
    return await Promise.all(rows.map(async (a) => {
      const u = await adb.prepare(`SELECT name, email, role, kyc_status FROM users WHERE id = ?`).get(a.lead_user_id) as any;
      return { ...a, lead_name: u?.name, lead_email: u?.email, lead_role: u?.role, lead_kyc_status: u?.kyc_status };
    }));
  }

  /** Agent earnings view under salary model: no commission ledger, just employment info */
  async dashboard(agentUserId: string) {
    const profile = await this.ensureProfile(agentUserId);
    return {
      employment: profile,
      leads: await this.myLeadsSummary(agentUserId),
      assignments_open: (await this.myAssignments(agentUserId)).filter((a) => a.status === 'assigned'),
      note: 'Agents are salaried - issue handling only, no commission.',
    };
  }

  private async myLeadsSummary(agentUserId: string) {
    return await this.adb().prepare(
      `SELECT lead_type, status, COUNT(*) AS count FROM onboarding_leads
       WHERE agent_user_id = ? AND is_deleted = 0 GROUP BY lead_type, status`,
    ).all(agentUserId);
  }
}
