import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../../common/auth/guards';
import { KycExempt } from '../../common/auth/kyc-gate.guard';
import { CrmService } from './crm.service';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Invalid calendar date');
const status = z.enum(['new','contacted','quoted','accepted','closed','lost']);
const create = z.object({ customer_user_id: z.string().uuid().optional(), subject: z.string().trim().min(3).max(160), city: z.string().trim().min(2).max(80), start_date: date, end_date: date, budget_paise: z.number().int().min(0).max(2147483647) }).strict().refine((v) => v.end_date > v.start_date, 'End date must follow start date');
const patch = z.object({ manager_user_id: z.string().uuid().nullable().optional(), agent_user_id: z.string().uuid().nullable().optional(), status: status.optional(), follow_up_at: z.string().datetime({ offset: true }).nullable().optional(), quote_paise: z.number().int().min(1).max(2147483647).optional(), quote_note: z.string().trim().max(2000).optional() }).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const staff = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email(), phone: z.string().regex(/^\+?[0-9]{10,14}$/), password: z.string().min(12).max(72), role: z.enum(['manager','agent']) }).strict();
const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().max(160).optional(), status: status.optional() });

@Controller('crm')
@KycExempt()
export class CrmController {
  constructor(private crm: CrmService) {}
  private parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
    const r = schema.safeParse(value);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return r.data;
  }
  private id(value: string) { return this.parse(z.string().uuid(), value); }

  @Roles('super_admin','manager') @Get('staff')
  async listStaff(@Req() req: any) { return await this.crm.staff(req.user); }
  @Roles('super_admin') @Post('staff')
  async createStaff(@Req() req: any, @Body() body: unknown) { return await this.crm.createStaff(req.user, this.parse(staff, body)); }
  @Roles('super_admin') @Put('team/:agentId')
  async team(@Req() req: any, @Param('agentId') id: string, @Body() body: unknown) {
    const dto = this.parse(z.object({ manager_user_id: z.string().uuid().nullable() }).strict(), body);
    return await this.crm.setTeam(req.user, this.id(id), dto.manager_user_id);
  }
  @Roles('super_admin','manager','agent','car_renter') @Get('enquiries')
  async list(@Req() req: any, @Query() q: unknown) { return await this.crm.list(req.user, this.parse(query, q)); }
  @Roles('super_admin','manager','agent','car_renter') @Post('enquiries')
  async create(@Req() req: any, @Body() body: unknown) { return await this.crm.create(req.user, this.parse(create, body)); }
  @Roles('super_admin','manager','agent') @Patch('enquiries/:id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: unknown) { return await this.crm.update(req.user, this.id(id), this.parse(patch, body)); }
  @Roles('super_admin','manager','agent','car_renter') @Get('enquiries/:id/activities')
  async activities(@Req() req: any, @Param('id') id: string) { return await this.crm.activities(req.user, this.id(id)); }
  @Roles('super_admin','manager','agent') @Post('enquiries/:id/notes')
  async note(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(z.object({ body: z.string().trim().min(1).max(2000) }).strict(), body);
    return await this.crm.note(req.user, this.id(id), dto.body);
  }
  @Roles('car_renter') @Post('enquiries/:id/accept')
  async accept(@Req() req: any, @Param('id') id: string) { return await this.crm.accept(req.user, this.id(id)); }
}
