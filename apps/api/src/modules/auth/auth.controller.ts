import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { KycService } from './kyc.service';
import { JwtAuthGuard, Public, Roles, RolesGuard } from '../../common/auth/guards';
import { KycExempt, KycGateGuard } from '../../common/auth/kyc-gate.guard';

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[0-9]{10,14}$/),
  password: z.string().min(8),
  role: z.enum(['car_owner', 'car_renter', 'agent']),
});
const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
// The code is six digits by construction, so anything else is rejected before
// it reaches a bcrypt comparison.
const twofaSchema = z.object({ twofa_token: z.string().min(1), code: z.string().regex(/^\d{6}$/, 'code must be 6 digits') });
const refreshSchema = z.object({ refresh_token: z.string() });
const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string(), new_password: z.string().min(8) });
const otpVerifySchema = z.object({ code: z.string().length(6) });
const updateProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().regex(/^\+?[0-9]{10,14}$/).optional(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_of_birth must be YYYY-MM-DD')
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return false;
      // Reject impossible calendar dates that the regex lets through,
      // e.g. 2026-02-31.
      return d.toISOString().slice(0, 10) === v;
    }, 'date_of_birth is not a real date')
    .refine((v) => new Date(`${v}T00:00:00Z`).getTime() < Date.now(), 'date_of_birth must be in the past')
    .refine((v) => {
      // 16 is the floor: car rental requires a valid driving licence, and the
      // KYC flow will reject anything younger regardless.
      const years = (Date.now() - new Date(`${v}T00:00:00Z`).getTime()) / (365.25 * 24 * 3600 * 1000);
      return years >= 16 && years <= 120;
    }, 'age must be between 16 and 120')
    .optional(),
  gender: z.enum(['female', 'male', 'non_binary', 'other', 'prefer_not_to_say']).optional(),
  address_line: z.string().min(3).max(200).optional(),
  city: z.string().min(2).max(80).optional(),
  state: z.string().min(2).max(80).optional(),
  pincode: z.string().regex(/^\d{4,10}$/, 'pincode must be 4-10 digits').optional(),
  // Nullable as well as optional: omitting a key leaves the pin alone, sending
  // an explicit null clears it. Without the null, a user could add a pin but
  // never remove one.
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).superRefine((v, ctx) => {
  // A point is a pair. The DB CHECK enforces this too, but a half-set pin is a
  // client bug worth naming precisely rather than surfacing as a constraint
  // violation with a Postgres error code.
  if ((v.latitude == null) !== (v.longitude == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [v.latitude == null ? 'longitude' : 'latitude'],
      message: 'latitude and longitude must be provided together',
    });
  }
});
const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject', 'first_pass']),
  reason: z.string().optional(),
});

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, KycGateGuard)
export class AuthController {
  constructor(private auth: AuthService, private kyc: KycService) {}

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const result = schema.safeParse(body);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  }

  @Public() @Post('auth/signup')
  async signup(@Body() body: unknown) {
    return await this.auth.signup(this.parse(signupSchema, body));
  }

  @Public() @HttpCode(200) @Post('auth/login')
  async loginMain(@Body() body: unknown) {
    const dto = this.parse(credentialsSchema, body);
    return await this.auth.loginMain(dto.email, dto.password);
  }

  @Public() @HttpCode(200) @Post('auth/admin/login')
  async loginAdmin(@Body() body: unknown) {
    const dto = this.parse(credentialsSchema, body);
    return await this.auth.loginAdmin(dto.email, dto.password);
  }

  @Public() @HttpCode(200) @Post('auth/admin/login/verify')
  async verify2fa(@Body() body: unknown) {
    const dto = this.parse(twofaSchema, body);
    return await this.auth.verifyAdmin2fa(dto.twofa_token, dto.code);
  }

  @Public() @HttpCode(200) @Post('auth/agent/login')
  async loginAgent(@Body() body: unknown) {
    const dto = this.parse(credentialsSchema, body);
    return await this.auth.loginAgent(dto.email, dto.password);
  }

  @Public() @HttpCode(200) @Post('auth/manager/login')
  async loginManager(@Body() body: unknown) {
    const dto = this.parse(credentialsSchema, body);
    return await this.auth.loginManager(dto.email, dto.password);
  }

  @Public() @HttpCode(200) @Post('auth/refresh')
  async refresh(@Body() body: unknown) {
    const dto = this.parse(refreshSchema, body);
    return await this.auth.refresh(dto.refresh_token);
  }

  @Public() @HttpCode(200) @Post('auth/forgot-password')
  async forgot(@Body() body: unknown) {
    return await this.auth.forgotPassword(this.parse(forgotSchema, body).email);
  }

  @Public() @HttpCode(200) @Post('auth/reset-password')
  async reset(@Body() body: unknown) {
    const dto = this.parse(resetSchema, body);
    return await this.auth.resetPassword(dto.token, dto.new_password);
  }

  @KycExempt() @Roles('super_admin', 'manager', 'car_owner', 'car_renter', 'agent') @HttpCode(200) @Post('auth/otp/phone/request')
  async requestOtp(@Req() req: any) {
    return await this.auth.requestPhoneOtp(req.user.id);
  }

  @KycExempt() @Roles('super_admin', 'manager', 'car_owner', 'car_renter', 'agent') @HttpCode(200) @Post('auth/otp/phone/verify')
  async verifyOtp(@Req() req: any, @Body() body: unknown) {
    return await this.auth.verifyPhoneOtp(req.user.id, this.parse(otpVerifySchema, body).code);
  }

  @KycExempt() @Roles('super_admin', 'manager', 'car_owner', 'car_renter', 'agent') @Get('auth/me')
  async me(@Req() req: any) {
    const u = await this.auth.getUserRaw(req.user.id);
    if (!u) throw new BadRequestException('User not found');
    return { user: this.auth.toPublicUser(u) };
  }

  // Editing your own name/phone is part of finishing signup, so this stays
  // @KycExempt alongside /auth/me and /kyc/me: a user whose KYC is still
  // pending must be able to correct their own details.
  @KycExempt() @Roles('super_admin', 'manager', 'car_owner', 'car_renter', 'agent') @Patch('auth/me')
  async updateMe(@Req() req: any, @Body() body: unknown) {
    const dto = this.parse(updateProfileSchema, body);
    const { name, phone, ...profile } = dto;
    if (name === undefined && phone === undefined && Object.keys(profile).length === 0) {
      throw new BadRequestException('Nothing to update');
    }
    return await this.auth.updateProfile(req.user.id, { name, phone, ...profile });
  }

  @Roles('car_owner', 'car_renter', 'agent') @HttpCode(200) @Post('auth/role-change-request')
  async requestRoleChange(@Req() req: any, @Body() body: unknown) {
    const dto = this.parse(z.object({ desired_role: z.enum(['car_owner', 'car_renter', 'agent']) }), body);
    return await this.auth.requestRoleChange(req.user.id, dto.desired_role);
  }

  @Roles('super_admin', 'manager', 'car_owner', 'car_renter', 'agent') @Get('auth/role-change-requests/mine')
  async myRoleRequests(@Req() req: any) {
    return await this.auth.myRoleChangeRequests(req.user.id);
  }

  // ---------- KYC ----------
  @KycExempt() @Roles('car_owner', 'car_renter', 'agent') @Post('kyc/documents')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDoc(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { [k: string]: unknown },
  ) {
    if (!file) throw new BadRequestException('file is required');
    const docType = String(body?.doc_type ?? '');
    if (!['id_proof', 'address_proof', 'aadhaar', 'driving_license'].includes(docType)) {
      throw new BadRequestException('Invalid doc_type');
    }
    const url = this.kyc.saveFile(file);
    return await this.kyc.upload(
      req.user.id,
      req.user.role,
      docType,
      url,
      body?.doc_number ? String(body.doc_number) : null,
      body?.doc_expiry ? String(body.doc_expiry) : null,
    );
  }

  /**
   * Aadhaar Paperless Offline e-KYC — the share-phrase ZIP from myAadhaar.
   *
   * Returns a domain result rather than an HTTP error: a wrong Share Phrase is
   * a typo to retry, and the UI needs the exact message either way. A verified
   * pack is filed as the applicant's `aadhaar` document.
   */
  @KycExempt() @Roles('car_owner', 'car_renter', 'agent') @HttpCode(200) @Post('kyc/offline-ekyc')
  @UseInterceptors(FileInterceptor('file'))
  async offlineEkyc(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { [k: string]: unknown },
  ) {
    return await this.kyc.offlineEkyc(req.user.id, req.user.role, file, body ?? {});
  }

  @KycExempt() @Roles('car_owner', 'car_renter', 'agent') @Get('kyc/me')
  async myKyc(@Req() req: any) {
    return await this.kyc.myDocuments(req.user.id);
  }

  @Roles('super_admin', 'agent') @Get('kyc/queue')
  async queue(@Req() req: any) {
    return await this.kyc.queue(req.user.id, req.user.role);
  }

  @Roles('super_admin', 'agent') @HttpCode(200) @Post('kyc/review/:docId')
  async review(@Req() req: any, @Param('docId') docId: string, @Body() body: unknown) {
    const dto = this.parse(reviewSchema, body);
    return await this.kyc.review(req.user.id, req.user.role, docId, dto.decision, dto.reason);
  }
}
