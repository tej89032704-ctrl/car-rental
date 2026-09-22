import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
const twofaSchema = z.object({ twofa_token: z.string(), code: z.string() });
const refreshSchema = z.object({ refresh_token: z.string() });
const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string(), new_password: z.string().min(8) });
const otpVerifySchema = z.object({ code: z.string().length(6) });
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
  signup(@Body() body: unknown) {
    return this.auth.signup(this.parse(signupSchema, body));
  }

  @Public() @HttpCode(200) @Post('auth/login')
  loginMain(@Body() body: unknown) {
    const dto = this.parse(credentialsSchema, body);
    return this.auth.loginMain(dto.email, dto.password);
  }

  @Public() @HttpCode(200) @Post('auth/admin/login')
  loginAdmin(@Body() body: unknown) {
    const dto = this.parse(credentialsSchema, body);
    return this.auth.loginAdmin(dto.email, dto.password);
  }

  @Public() @HttpCode(200) @Post('auth/admin/login/verify')
  verify2fa(@Body() body: unknown) {
    const dto = this.parse(twofaSchema, body);
    return this.auth.verifyAdmin2fa(dto.twofa_token, dto.code);
  }

  @Public() @HttpCode(200) @Post('auth/agent/login')
  loginAgent(@Body() body: unknown) {
    const dto = this.parse(credentialsSchema, body);
    return this.auth.loginAgent(dto.email, dto.password);
  }

  @Public() @HttpCode(200) @Post('auth/refresh')
  refresh(@Body() body: unknown) {
    const dto = this.parse(refreshSchema, body);
    return this.auth.refresh(dto.refresh_token);
  }

  @Public() @HttpCode(200) @Post('auth/forgot-password')
  forgot(@Body() body: unknown) {
    return this.auth.forgotPassword(this.parse(forgotSchema, body).email);
  }

  @Public() @HttpCode(200) @Post('auth/reset-password')
  reset(@Body() body: unknown) {
    const dto = this.parse(resetSchema, body);
    return this.auth.resetPassword(dto.token, dto.new_password);
  }

  @KycExempt() @Roles('super_admin', 'car_owner', 'car_renter', 'agent') @HttpCode(200) @Post('auth/otp/phone/request')
  requestOtp(@Req() req: any) {
    return this.auth.requestPhoneOtp(req.user.id);
  }

  @KycExempt() @Roles('super_admin', 'car_owner', 'car_renter', 'agent') @HttpCode(200) @Post('auth/otp/phone/verify')
  verifyOtp(@Req() req: any, @Body() body: unknown) {
    return this.auth.verifyPhoneOtp(req.user.id, this.parse(otpVerifySchema, body).code);
  }

  @KycExempt() @Roles('super_admin', 'car_owner', 'car_renter', 'agent') @Get('auth/me')
  me(@Req() req: any) {
    const u = this.auth.getUserRaw(req.user.id);
    if (!u) throw new BadRequestException('User not found');
    return { user: this.auth.toPublicUser(u) };
  }

  @Roles('car_owner', 'car_renter', 'agent') @HttpCode(200) @Post('auth/role-change-request')
  requestRoleChange(@Req() req: any, @Body() body: unknown) {
    const dto = this.parse(z.object({ desired_role: z.enum(['car_owner', 'car_renter', 'agent']) }), body);
    return this.auth.requestRoleChange(req.user.id, dto.desired_role);
  }

  @Roles('super_admin', 'car_owner', 'car_renter', 'agent') @Get('auth/role-change-requests/mine')
  myRoleRequests(@Req() req: any) {
    return this.auth.myRoleChangeRequests(req.user.id);
  }

  // ---------- KYC ----------
  @KycExempt() @Roles('car_owner', 'car_renter', 'agent') @Post('kyc/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadDoc(@Req() req: any, @UploadedFile() file: Express.Multer.File, @Body('doc_type') docType: string) {
    if (!file) throw new BadRequestException('file is required');
    if (!['id_proof', 'address_proof'].includes(docType)) throw new BadRequestException('Invalid doc_type');
    const url = this.kyc.saveFile(file);
    return this.kyc.upload(req.user.id, req.user.role, docType, url);
  }

  @KycExempt() @Roles('car_owner', 'car_renter', 'agent') @Get('kyc/me')
  myKyc(@Req() req: any) {
    return this.kyc.myDocuments(req.user.id);
  }

  @Roles('super_admin', 'agent') @Get('kyc/queue')
  queue(@Req() req: any) {
    return this.kyc.queue(req.user.id, req.user.role);
  }

  @Roles('super_admin', 'agent') @HttpCode(200) @Post('kyc/review/:docId')
  review(@Req() req: any, @Param('docId') docId: string, @Body() body: unknown) {
    const dto = this.parse(reviewSchema, body);
    return this.kyc.review(req.user.id, req.user.role, docId, dto.decision, dto.reason);
  }
}
