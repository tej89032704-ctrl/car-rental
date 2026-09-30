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
  async create(@Req() req: any, @Body() body: unknown) {
    return await this.bookings.createRequest(req.user.id, this.parse(requestSchema, body));
  }

  @Roles('car_renter') @Get('bookings/my')
  async myBookings(@Req() req: any) {
    return await this.bookings.myBookings(req.user.id, 'car_renter');
  }

  @Roles('car_renter') @HttpCode(200) @Post('bookings/:id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return await this.bookings.cancelByRenter(req.user.id, id, body?.reason);
  }

  @Roles('car_renter') @HttpCode(200) @Post('bookings/:id/pay')
  async payOnline(@Req() req: any, @Param('id') id: string) {
    return await this.bookings.payOnline(req.user.id, id);
  }

  @Roles('car_renter') @HttpCode(200) @Post('bookings/:id/extend')
  async extend(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(extensionSchema, body);
    return await this.bookings.requestExtension(req.user.id, id, dto.new_end_date);
  }

  @Roles('car_renter') @HttpCode(200) @Post('reviews')
  async reviewAsRenter(@Req() req: any, @Body() body: unknown) {
    return await this.bookings.leaveReview(req.user.id, 'car_renter', this.parse(reviewSchema, body));
  }

  // ---------- Owner ----------
  @Roles('car_owner') @Get('bookings/requests')
  async ownerRequests(@Req() req: any) {
    return await this.bookings.bookingRequestsForOwner(req.user.id);
  }

  @Roles('car_owner') @Get('bookings/completed')
  async ownerCompleted(@Req() req: any) {
    return await this.bookings.completedBookingsForOwner(req.user.id);
  }

  @Roles('car_owner') @Get('bookings/my')
  async myOwnerBookings(@Req() req: any) {
    return await this.bookings.myBookings(req.user.id, 'car_owner');
  }

  @Roles('car_owner') @HttpCode(200) @Post('bookings/:id/decide')
  async decide(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(z.object({ decision: z.enum(['approve', 'reject']) }), body);
    return await this.bookings.ownerDecide(req.user.id, id, dto.decision);
  }

  @Roles('car_owner') @HttpCode(200) @Post('bookings/:id/start-trip')
  async startTrip(@Req() req: any, @Param('id') id: string) {
    return await this.bookings.startTripWithCashRecorded(req.user.id, id);
  }

  @Roles('car_owner') @HttpCode(200) @Post('bookings/:id/complete')
  async complete(@Req() req: any, @Param('id') id: string) {
    return await this.bookings.completeTrip(req.user.id, id);
  }

  @Roles('car_owner') @HttpCode(200) @Post('extensions/:id/decide')
  async decideExtension(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(z.object({ decision: z.enum(['approve', 'reject']) }), body);
    return await this.bookings.decideExtension(req.user.id, id, dto.decision);
  }

  @Roles('car_owner') @Get('extensions')
  async ownerExtensions(@Req() req: any) {
    return await this.bookings.pendingExtensionsForOwner(req.user.id);
  }

  @Roles('car_owner') @HttpCode(200) @Post('reviews/renter')
  async reviewAsOwner(@Req() req: any, @Body() body: unknown) {
    return await this.bookings.leaveReview(req.user.id, 'car_owner', this.parse(reviewSchema, body));
  }

  // ---------- Both ----------
  @Roles('car_renter', 'car_owner') @Get('bookings/:id')
  async detail(@Req() req: any, @Param('id') id: string) {
    return await this.bookings.bookingDetail(id, req.user);
  }

  @Roles('car_owner', 'car_renter') @HttpCode(200) @Post('disputes')
  async raiseDispute(@Req() req: any, @Body() body: unknown) {
    return await this.bookings.raiseDispute(req.user.id, this.parse(disputeSchema, body));
  }
  @Get('reviews/my')
  @Roles('car_renter', 'car_owner')
  async myReviews(@Req() req: any) {
    return await this.bookings.getReviewsByReviewer(req.user.id);
  }

  // What *other* people said about me — the mirror of /reviews/my.
  @Get('reviews/about-me')
  @Roles('car_renter', 'car_owner')
  async reviewsAboutMe(@Req() req: any) {
    return await this.bookings.getReviewsAboutMe(req.user.id, req.user.role);
  }

}
