import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { Roles } from '../../common/auth/guards';
import { AdminService } from './admin.service';

const statusSchema = z.object({ status: z.enum(['active', 'suspended', 'banned']) });
const carDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().optional() });
const settingSchema = z.object({ key: z.string(), value_int: z.coerce.number().int() });
const resolveSchema = z.object({
  resolution_note: z.string().min(3),
  refund_amount_paise: z.coerce.number().int().min(0).optional(),
  penalty_amount_paise: z.coerce.number().int().min(0).optional(),
});
const assignmentSchema = z.object({
  agent_user_id: z.string().uuid(),
  lead_user_id: z.string().uuid(),
  type: z.enum(['kyc_first_pass', 'lead_followup', 'issue_resolution']),
});
const salarySchema = z.object({ agent_user_id: z.string().uuid(), monthly_salary_paise: z.coerce.number().int().min(0) });
const rejectPayoutSchema = z.object({ reason: z.string().min(3) });

@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const r = schema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return r.data;
  }

  @Roles('super_admin')
  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Roles('super_admin')
  @Get('users')
  users(@Query('search') search?: string, @Query('role') role?: string) {
    return this.admin.listUsers(search || undefined, role || undefined);
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('users/:id/status')
  userStatus(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(statusSchema, body);
    return this.admin.setUserStatus(req.user.id, id, dto.status);
  }

  @Roles('super_admin')
  @Get('cars/queue')
  carQueue() {
    return this.admin.carApprovalQueue();
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('cars/:id/decide')
  decideCar(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(carDecisionSchema, body);
    return this.admin.decideCar(req.user.id, id, dto.decision, dto.reason);
  }

  @Roles('super_admin')
  @Get('settings')
  settings() {
    return this.admin.settings();
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('settings')
  updateSetting(@Req() req: any, @Body() body: unknown) {
    const dto = this.parse(settingSchema, body);
    return this.admin.updateSetting(req.user.id, dto.key, dto.value_int);
  }

  @Roles('super_admin')
  @Get('payouts')
  payouts(@Query('status') status?: string) {
    return this.admin.payouts(status || undefined);
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('payouts/:id/approve')
  approvePayout(@Req() req: any, @Param('id') id: string) {
    return this.admin.approvePayout(req.user.id, id);
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('payouts/:id/reject')
  rejectPayout(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(rejectPayoutSchema, body);
    return this.admin.rejectPayout(req.user.id, id, dto.reason);
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('payouts/:id/paid')
  markPaid(@Req() req: any, @Param('id') id: string) {
    return this.admin.markPaid(req.user.id, id);
  }

  @Roles('super_admin')
  @Get('disputes/open')
  openDisputes() {
    return this.admin.openDisputes();
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('disputes/:id/resolve')
  resolveDispute(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(resolveSchema, body);
    return this.admin.resolveDispute(req.user.id, id, dto);
  }

  @Roles('super_admin')
  @Get('role-change-requests')
  roleRequests(@Query('status') status?: string) {
    return this.admin.listRoleChangeRequests(status || undefined);
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('role-change-requests/:id/decide')
  decideRoleRequest(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(z.object({ decision: z.enum(['approve', 'reject']) }), body);
    return this.admin.decideRoleChange(req.user.id, id, dto.decision);
  }

  @Roles('super_admin')
  @Get('agents')
  agents() {
    return this.admin.listAgents();
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('agents/salary')
  setSalary(@Req() req: any, @Body() body: unknown) {
    const dto = this.parse(salarySchema, body);
    return this.admin.setAgentSalary(req.user.id, dto.agent_user_id, dto.monthly_salary_paise);
  }

  @Roles('super_admin')
  @HttpCode(200)
  @Post('agents/assign')
  assignLead(@Req() req: any, @Body() body: unknown) {
    const dto = this.parse(assignmentSchema, body);
    return this.admin.assignLead(req.user.id, dto.agent_user_id, dto.lead_user_id, dto.type);
  }

  @Roles('super_admin')
  @Get('reports/:kind')
  report(@Res() res: Response, @Param('kind') kind: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (!['bookings', 'revenue', 'subscriptions'].includes(kind)) throw new BadRequestException('Unknown report');
    const csv = this.admin.reportCsv(kind as any, from, to);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-report.csv"`);
    res.send(csv);
  }
}
