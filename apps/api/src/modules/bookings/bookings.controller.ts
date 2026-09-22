import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../../common/auth/guards';
import { BookingsService } from './bookings.service';

const requestSchema = z.object({
  car_id: z.string().uuid(),
  start_date: z.string(),
  end_date: z.string(),
});
const reviewSchema = z.object({
  booking_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
const disputeSchema = z.object({ booking_id: z.string().uuid(), reason: z.string().min(5) });
const extensionSchema = z.object({ new_end_date: z.string() });

@Controller()
export class BookingsController {
  constructor(private bookings: BookingsService) {}

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const r = schema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return r.data;
  }

  // ---------- Renter ----------
  @Roles('car_renter') @Post('bookings')
  create(@Req() req: any, @Body() body: unknown) {
    return this.bookings.createRequest(req.user.id, this.parse(requestSchema, body));
  }

  @Roles('car_renter') @Get('bookings/my')
  myBookings(@Req() req: any) {
    return this.bookings.myBookings(req.user.id, 'car_renter');
  }

  @Roles('car_renter') @HttpCode(200) @Post('bookings/:id/cancel')
  cancel(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.bookings.cancelByRenter(req.user.id, id, body?.reason);
  }

  @Roles('car_renter') @HttpCode(200) @Post('bookings/:id/pay')
  payOnline(@Req() req: any, @Param('id') id: string) {
    return this.bookings.payOnline(req.user.id, id);
  }

  @Roles('car_renter') @HttpCode(200) @Post('bookings/:id/extend')
  extend(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(extensionSchema, body);
    return this.bookings.requestExtension(req.user.id, id, dto.new_end_date);
  }

  @Roles('car_renter') @HttpCode(200) @Post('reviews')
  reviewAsRenter(@Req() req: any, @Body() body: unknown) {
    return this.bookings.leaveReview(req.user.id, 'car_renter', this.parse(reviewSchema, body));
  }

  // ---------- Owner ----------
  @Roles('car_owner') @Get('bookings/requests')
  ownerRequests(@Req() req: any) {
    return this.bookings.bookingRequestsForOwner(req.user.id);
  }

  @Roles('car_owner') @Get('bookings/completed')
  ownerCompleted(@Req() req: any) {
    return this.bookings.completedBookingsForOwner(req.user.id);
  }

  @Roles('car_owner') @Get('bookings/my')
  myOwnerBookings(@Req() req: any) {
    return this.bookings.myBookings(req.user.id, 'car_owner');
  }

  @Roles('car_owner') @HttpCode(200) @Post('bookings/:id/decide')
  decide(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(z.object({ decision: z.enum(['approve', 'reject']) }), body);
    return this.bookings.ownerDecide(req.user.id, id, dto.decision);
  }

  @Roles('car_owner') @HttpCode(200) @Post('bookings/:id/start-trip')
  startTrip(@Req() req: any, @Param('id') id: string) {
    return this.bookings.startTripWithCashRecorded(req.user.id, id);
  }

  @Roles('car_owner') @HttpCode(200) @Post('bookings/:id/complete')
  complete(@Req() req: any, @Param('id') id: string) {
    return this.bookings.completeTrip(req.user.id, id);
  }

  @Roles('car_owner') @HttpCode(200) @Post('extensions/:id/decide')
  decideExtension(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(z.object({ decision: z.enum(['approve', 'reject']) }), body);
    return this.bookings.decideExtension(req.user.id, id, dto.decision);
  }

  @Roles('car_owner') @Get('extensions')
  ownerExtensions(@Req() req: any) {
    return this.bookings.pendingExtensionsForOwner(req.user.id);
  }

  @Roles('car_owner') @HttpCode(200) @Post('reviews/renter')
  reviewAsOwner(@Req() req: any, @Body() body: unknown) {
    return this.bookings.leaveReview(req.user.id, 'car_owner', this.parse(reviewSchema, body));
  }

  // ---------- Both ----------
  @Roles('car_renter', 'car_owner') @Get('bookings/:id')
  detail(@Req() req: any, @Param('id') id: string) {
    return this.bookings.bookingDetail(id, req.user);
  }

  @Roles('car_owner', 'car_renter') @HttpCode(200) @Post('disputes')
  raiseDispute(@Req() req: any, @Body() body: unknown) {
    return this.bookings.raiseDispute(req.user.id, this.parse(disputeSchema, body));
  }
}
