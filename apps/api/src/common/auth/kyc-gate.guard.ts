import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestUser } from './guards';

export const KYC_EXEMPT_KEY = 'kyc_exempt';
export const KycExempt = () => SetMetadata(KYC_EXEMPT_KEY, true);

@Injectable()
export class KycGateGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const exempt = this.reflector.getAllAndOverride<boolean>(KYC_EXEMPT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (exempt) return true;

    const req = ctx.switchToHttp().getRequest();
    const user: RequestUser | undefined = req.user;
    if (!user) return true;

    if (user.role === 'super_admin') return true;

    if (user.status === 'suspended' || user.status === 'banned') {
      throw new ForbiddenException(`Account ${user.status}. Contact support.`);
    }

    if (user.kyc_status !== 'approved') {
      throw new ForbiddenException('KYC not approved yet — account actions are locked');
    }
    return true;
  }
}
