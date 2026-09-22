import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../../common/auth/guards';
import { AgentsService } from './agents.service';
import { getDb } from '../../common/db/database';

const leadSchema = z.object({
  lead_name: z.string().min(2),
  lead_phone: z.string().regex(/^\+?[0-9]{10,14}$/),
  lead_email: z.string().email(),
  lead_type: z.enum(['owner_onboarding', 'renter_onboarding']),
});
const noteSchema = z.object({ note: z.string().max(500).optional() });

@Controller()
export class AgentsController {
  constructor(private agents: AgentsService) {}

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const r = schema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return r.data;
  }

  @Roles('agent') @Get('agent/dashboard')
  dashboard(@Req() req: any) {
    return this.agents.dashboard(req.user.id);
  }

  @Roles('agent') @HttpCode(200) @Post('agent/leads')
  createLead(@Req() req: any, @Body() body: unknown) {
    return this.agents.createLead(req.user.id, this.parse(leadSchema, body));
  }

  @Roles('agent') @Get('agent/leads')
  myLeads(@Req() req: any) {
    return this.agents.myLeads(req.user.id);
  }

  @Roles('agent') @Get('agent/assignments')
  myAssignments(@Req() req: any) {
    return this.agents.myAssignments(req.user.id);
  }

  @Roles('agent') @HttpCode(200) @Post('agent/assignments/:id/close')
  closeAssignment(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(noteSchema, body);
    const db = getDb('agent');
    const a = db.prepare(`SELECT * FROM agent_assignments WHERE id = ?`).get(id) as any;
    if (!a || a.agent_user_id !== req.user.id) throw new BadRequestException('Assignment not found');
    db.prepare(`UPDATE agent_assignments SET status = 'done', note = ?, updated_at = ? WHERE id = ?`)
      .run(dto.note ?? null, new Date().toISOString(), id);
    return { message: 'Assignment closed' };
  }
}
