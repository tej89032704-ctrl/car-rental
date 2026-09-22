import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { Roles, Public } from '../../common/auth/guards';
import { FleetService } from './fleet.service';

const carSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1),
  plate_number: z.string().min(4).max(15),
  category: z.enum(['hatchback', 'sedan', 'suv', 'luxury', 'van']),
  transmission: z.enum(['manual', 'automatic']),
  fuel_type: z.enum(['petrol', 'diesel', 'ev', 'cng']),
  seats: z.coerce.number().int().min(2).max(12),
});
const pricingSchema = z.object({
  daily_rate_paise: z.coerce.number().int().positive(),
  weekly_rate_paise: z.coerce.number().int().positive().optional(),
  monthly_rate_paise: z.coerce.number().int().positive().optional(),
  security_deposit_paise: z.coerce.number().int().min(0).default(0),
});
const availabilitySchema = z.object({
  dates: z.array(z.string()).min(1),
  is_available: z.boolean(),
  reason: z.string().optional(),
});

@Controller()
export class FleetController {
  constructor(private fleet: FleetService) {}

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const r = schema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return r.data;
  }

  @Roles('car_owner') @Post('cars')
  create(@Req() req: any, @Body() body: unknown) {
    return this.fleet.createCar(req.user.id, this.parse(carSchema, body));
  }

  @Public() @Get('cars/search')
  search(@Query('category') category?: string) {
    return this.fleet.searchAvailable(category || undefined);
  }

  @Roles('car_owner') @Get('cars/mine')
  mine(@Req() req: any, @Query('status') status?: string) {
    return this.fleet.myCars(req.user.id, status || undefined);
  }

  @Roles('car_owner') @Patch('cars/:id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.fleet.updateCar(req.user.id, id, carSchema.partial().parse(body));
  }

  @Roles('car_owner') @Delete('cars/:id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.fleet.softDeleteCar(req.user.id, id);
  }

  @Public() @Get('cars/:id')
  detail(@Req() req: any, @Param('id') id: string) {
    return this.fleet.carDetail(id, req.user);
  }

  @Roles('car_owner') @Post('cars/:id/photos')
  @UseInterceptors(FilesInterceptor('files', 10))
  photos(@Req() req: any, @Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('files required');
    return this.fleet.addPhotos(req.user.id, id, files);
  }

  @Roles('car_owner') @Post('cars/:id/documents')
  @UseInterceptors(FileInterceptor('file'))
  documents(@Req() req: any, @Param('id') id: string, @Body('doc_type') docType: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file required');
    return this.fleet.addDocument(req.user.id, id, docType, file);
  }

  @Roles('car_owner') @HttpCode(200) @Post('cars/:id/submit')
  submit(@Req() req: any, @Param('id') id: string) {
    return this.fleet.submitForReview(req.user.id, id);
  }

  @Roles('car_owner') @Put('cars/:id/pricing')
  pricing(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.fleet.setPricing(req.user.id, id, this.parse(pricingSchema, body));
  }

  @Roles('car_owner') @Put('cars/:id/availability')
  availability(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse(availabilitySchema, body);
    return this.fleet.setAvailability(req.user.id, id, dto.dates, dto.is_available, dto.reason);
  }

  @Roles('car_owner', 'car_renter', 'super_admin') @Get('cars/:id/availability')
  getAvailability(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) throw new BadRequestException('from and to (YYYY-MM-DD) required');
    return this.fleet.getAvailability(id, from, to);
  }

  @Public() @Get('cars/:id/reviews')
  carReviews(@Param('id') id: string) {
    return this.fleet.carReviews(id);
  }
}
