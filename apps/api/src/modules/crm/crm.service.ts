import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { RequestUser } from '../../common/auth/guards';
import { writeAudit } from '../../common/audit/audit';

type EnquiryPatch = { manager_user_id?: string | null; agent_user_id?: string | null; status?: string; follow_up_at?: string | null; quote_paise?: number; quote_note?: string };

@Injectable()
export class CrmService {
  private db() { return getDb('agent'); }

  private scope(user: RequestUser) {
    if (user.role === 'super_admin') return { sql: '1 = 1', args: [] as string[] };
    if (user.role === 'manager') return {
      sql: `(e.manager_user_id = ? AND (e.agent_user_id IS NULL OR EXISTS (SELECT 1 FROM manager_memberships m WHERE m.agent_user_id = e.agent_user_id AND m.manager_user_id = ?)))`, args: [user.id, user.id],
    };
    if (user.role === 'agent') return { sql: 'e.agent_user_id = ?', args: [user.id] };
    if (user.role === 'car_renter') return { sql: 'e.customer_user_id = ?', args: [user.id] };
    throw new ForbiddenException('CRM is not available for your role');
  }

  private async enquiry(user: RequestUser, id: string, lock = false) {
    const s = this.scope(user);
    const row = await this.db().prepare(`SELECT e.* FROM crm_enquiries e WHERE e.id = ? AND e.is_deleted = 0 AND ${s.sql}${lock ? ' FOR UPDATE' : ''}`).get(id, ...s.args);
    if (!row) throw new NotFoundException('Enquiry not found');
    return row;
  }

  private async activeUser(id: string, role: string) {
    const user = await getDb('auth').prepare(`SELECT id, name FROM users WHERE id = ? AND role = ? AND status = 'active' AND is_deleted = 0`).get(id, role);
    if (!user) throw new BadRequestException(`Select an active ${role} account`);
    return user;
  }

  private async activity(user: RequestUser, id: string, kind: string, visibility: string, body: string) {
    const at = nowUtc();
    await this.db().prepare(`INSERT INTO crm_activities (id, enquiry_id, actor_id, kind, visibility, body, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uuid(), id, user.id, kind, visibility, body, at, at, user.id);
  }

  async staff(user: RequestUser) {
    const memberships = await this.db().prepare(`SELECT * FROM manager_memberships${user.role === 'manager' ? ' WHERE manager_user_id = ?' : ''}`).all(...(user.role === 'manager' ? [user.id] : []));
    const rows = await getDb('auth').prepare(`SELECT id, name, email, role, status FROM users WHERE role IN ('manager','agent') AND is_deleted = 0 ORDER BY name`).all();
    return rows.filter((u) => user.role === 'super_admin' || memberships.some((m) => m.agent_user_id === u.id))
      .map((u) => ({ ...u, manager_user_id: memberships.find((m) => m.agent_user_id === u.id)?.manager_user_id ?? null }));
  }

  async createStaff(user: RequestUser, dto: { name: string; email: string; phone: string; password: string; role: 'manager' | 'agent' }) {
    const db = getDb('auth');
    const id = uuid();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      await db.transaction(async () => {
        await db.prepare(`INSERT INTO users (id, name, email, phone, password_hash, role, status, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
          .run(id, dto.name, dto.email.toLowerCase(), dto.phone, passwordHash, dto.role, nowUtc(), nowUtc(), user.id);
        await writeAudit('auth', { actor_id: user.id, action: 'staff.created', entity_type: 'user', entity_id: id, after_value: { role: dto.role, name: dto.name } });
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new BadRequestException('Email or phone already in use');
      throw error;
    }
    return { id, message: `${dto.role === 'manager' ? 'Manager' : 'Agent'} account created. Share the password securely.` };
  }

  async setTeam(user: RequestUser, agentId: string, managerId: string | null) {
    await this.activeUser(agentId, 'agent');
    if (managerId) await this.activeUser(managerId, 'manager');
    await this.db().transaction(async () => {
      // Serializes moves against enquiries created/assigned to this agent.
      await this.db().prepare(`SELECT pg_advisory_xact_lock(hashtext(?))`).get(agentId);
      if (managerId) {
        await this.db().prepare(`INSERT INTO manager_memberships (agent_user_id, manager_user_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT (agent_user_id) DO UPDATE SET manager_user_id = EXCLUDED.manager_user_id, updated_at = EXCLUDED.updated_at, created_by = EXCLUDED.created_by`)
          .run(agentId, managerId, nowUtc(), nowUtc(), user.id);
      } else {
        await this.db().prepare(`DELETE FROM manager_memberships WHERE agent_user_id = ?`).run(agentId);
      }
      await this.db().prepare(`UPDATE crm_enquiries SET manager_user_id = ?, agent_user_id = ?, updated_at = ? WHERE agent_user_id = ?`)
        .run(managerId, managerId ? agentId : null, nowUtc(), agentId);
      await writeAudit('agent', { actor_id: user.id, action: 'team.assigned', entity_type: 'agent', entity_id: agentId, after_value: { manager_user_id: managerId } });
    });
    return { message: 'Team assignment saved' };
  }

  async list(user: RequestUser, query: { page: number; pageSize: number; search?: string; status?: string }) {
    const s = this.scope(user);
    let where = `e.is_deleted = 0 AND ${s.sql}`;
    const args: unknown[] = [...s.args];
    if (query.search) { where += ' AND (e.subject ILIKE ? OR e.city ILIKE ?)'; args.push(`%${query.search}%`, `%${query.search}%`); }
    if (query.status) { where += ' AND e.status = ?'; args.push(query.status); }
    const total = (await this.db().prepare(`SELECT COUNT(*) AS total FROM crm_enquiries e WHERE ${where}`).get(...args)).total;
    const data = await this.db().prepare(`SELECT e.*, to_char(e.start_date, 'YYYY-MM-DD') AS start_date, to_char(e.end_date, 'YYYY-MM-DD') AS end_date FROM crm_enquiries e WHERE ${where} ORDER BY e.created_at DESC, e.id LIMIT ? OFFSET ?`)
      .all(...args, query.pageSize, (query.page - 1) * query.pageSize);
    const ids = [...new Set(data.flatMap((r) => [r.customer_user_id, r.agent_user_id, r.manager_user_id].filter(Boolean)))];
    const people = ids.length ? await getDb('auth').prepare(`SELECT id, name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
    return { data: data.map((r) => ({ ...r, customer_name: people.find((u) => u.id === r.customer_user_id)?.name, agent_name: people.find((u) => u.id === r.agent_user_id)?.name, manager_name: people.find((u) => u.id === r.manager_user_id)?.name })), pagination: { page: query.page, pageSize: query.pageSize, totalItems: total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async create(user: RequestUser, dto: { customer_user_id?: string; subject: string; city: string; start_date: string; end_date: string; budget_paise: number }) {
    const customerId = user.role === 'car_renter' ? user.id : dto.customer_user_id;
    if (!customerId) throw new BadRequestException('Customer account ID is required');
    await this.activeUser(customerId, 'car_renter');
    return await this.db().transaction(async () => {
      let managerId: string | null = user.role === 'manager' ? user.id : null;
      const agentId = user.role === 'agent' ? user.id : null;
      if (agentId) {
        await this.db().prepare(`SELECT pg_advisory_xact_lock(hashtext(?))`).get(agentId);
        managerId = (await this.db().prepare(`SELECT manager_user_id FROM manager_memberships WHERE agent_user_id = ?`).get(agentId))?.manager_user_id;
        if (!managerId) throw new BadRequestException('Ask an administrator to assign you to a manager first');
      }
      const id = uuid();
      await this.db().prepare(`INSERT INTO crm_enquiries (id, customer_user_id, manager_user_id, agent_user_id, subject, city, start_date, end_date, budget_paise, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, customerId, managerId, agentId, dto.subject, dto.city, dto.start_date, dto.end_date, dto.budget_paise, nowUtc(), nowUtc(), user.id);
      await this.activity(user, id, 'created', 'customer', 'Rental enquiry received. Our team will follow up.');
      await writeAudit('agent', { actor_id: user.id, action: 'enquiry.created', entity_type: 'enquiry', entity_id: id });
      return { id, message: 'Enquiry submitted' };
    });
  }

  async update(user: RequestUser, id: string, patch: EnquiryPatch) {
    return await this.db().transaction(async () => {
      // Lock agent first to use the same order as team transfers.
      const initial = await this.enquiry(user, id);
      const agentId = patch.agent_user_id === undefined ? initial.agent_user_id : patch.agent_user_id;
      const lockIds = [...new Set([initial.agent_user_id, agentId].filter(Boolean))].sort();
      for (const agent of lockIds) await this.db().prepare(`SELECT pg_advisory_xact_lock(hashtext(?))`).get(agent);
      const before = await this.enquiry(user, id, true);
      if (before.updated_at !== initial.updated_at) throw new BadRequestException('Enquiry changed; reload before saving');
      if (['accepted', 'closed', 'lost'].includes(before.status)) throw new BadRequestException('This enquiry is no longer editable');
      if (user.role === 'agent' && (patch.manager_user_id !== undefined || patch.agent_user_id !== undefined)) throw new ForbiddenException('Agents cannot reassign enquiries');
      let managerId = patch.manager_user_id === undefined ? before.manager_user_id : patch.manager_user_id;
      if (user.role === 'manager' && managerId !== user.id) throw new ForbiddenException('Managers cannot transfer enquiries outside their team');
      if (managerId) await this.activeUser(managerId, 'manager');
      if (agentId) {
        await this.activeUser(agentId, 'agent');
        const membership = await this.db().prepare(`SELECT manager_user_id FROM manager_memberships WHERE agent_user_id = ?`).get(agentId);
        if (!membership || membership.manager_user_id !== managerId) throw new BadRequestException('Agent must belong to the selected manager');
      }
      const status = patch.status ?? before.status;
      const transitions: Record<string, string[]> = { new: ['new','contacted','quoted','closed','lost'], contacted: ['contacted','quoted','closed','lost'], quoted: ['quoted','contacted','closed','lost'] };
      if (!transitions[before.status]?.includes(status)) throw new BadRequestException('Invalid enquiry transition');
      const quote = patch.quote_paise ?? before.quote_paise;
      if (status === 'quoted' && !quote) throw new BadRequestException('A quote amount is required');
      await this.db().prepare(`UPDATE crm_enquiries SET manager_user_id = ?, agent_user_id = ?, status = ?, follow_up_at = ?, quote_paise = ?, quote_note = ?, updated_at = ? WHERE id = ?`)
        .run(managerId, agentId, status, patch.follow_up_at === undefined ? before.follow_up_at : patch.follow_up_at, quote, patch.quote_note ?? before.quote_note, nowUtc(), id);
      await this.activity(user, id, 'updated', 'customer', `Enquiry status: ${status}.`);
      await writeAudit('agent', { actor_id: user.id, action: 'enquiry.updated', entity_type: 'enquiry', entity_id: id, before_value: before, after_value: patch });
      return { message: 'Enquiry updated' };
    });
  }

  async activities(user: RequestUser, id: string) {
    await this.enquiry(user, id);
    return await this.db().prepare(`SELECT id, kind, body, visibility, created_at FROM crm_activities WHERE enquiry_id = ?${user.role === 'car_renter' ? " AND visibility = 'customer'" : ''} ORDER BY created_at DESC LIMIT 100`).all(id);
  }

  async note(user: RequestUser, id: string, body: string) {
    return await this.db().transaction(async () => {
      await this.enquiry(user, id, true);
      await this.activity(user, id, 'note', 'internal', body);
      return { message: 'Internal note added' };
    });
  }

  async accept(user: RequestUser, id: string) {
    return await this.db().transaction(async () => {
      const row = await this.enquiry(user, id, true);
      if (row.status !== 'quoted') throw new BadRequestException('Only a quoted enquiry can be accepted');
      await this.db().prepare(`UPDATE crm_enquiries SET status = 'accepted', updated_at = ? WHERE id = ?`).run(nowUtc(), id);
      await this.activity(user, id, 'accepted', 'customer', 'Customer accepted the quote. A separate owner-approved booking is still required.');
      await writeAudit('agent', { actor_id: user.id, action: 'enquiry.accepted', entity_type: 'enquiry', entity_id: id, after_value: { quote_paise: row.quote_paise } });
      return { message: 'Quote accepted. This is not a booking confirmation or payment.' };
    });
  }
}
