import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../../common/auth/guards';
import { PaymentsService } from './payments.service';

const pricingSchema = z.object({ amount_paise: z.coerce.number().int().positive() });
const settingSchema = z.object({ key: z.string(), value_int: z.coerce.number().int() });

@Controller()
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const r = schema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return r.data;
  }

  @Roles('car_owner') @HttpCode(200) @Post('subscriptions/owner/monthly')
  ownerSub(@Req() req: any) {
    return this.payments.subscribeOwnerMonthly(req.user.id, req.user.id);
  }

  @Roles('car_renter') @HttpCode(200) @Post('subscriptions/renter/lifetime')
  renterSub(@Req() req: any) {
    return this.payments.subscribeRenterLifetime(req.user.id, req.user.id);
  }

  @Roles('super_admin', 'car_owner', 'car_renter', 'agent') @Get('subscriptions/mine')
  mySubs(@Req() req: any) {
    return this.payments.mySubscriptions(req.user.id);
  }

  @Roles('car_owner') @Get('payments/earnings')
  earnings(@Req() req: any) {
    return this.payments.earningsFor(req.user.id);
  }

  @Roles('car_owner') @HttpCode(200) @Post('payouts/request')
  requestPayout(@Req() req: any, @Body() body: unknown) {
    return this.payments.requestPayout(req.user.id, this.parse(pricingSchema, body).amount_paise);
  }
}
