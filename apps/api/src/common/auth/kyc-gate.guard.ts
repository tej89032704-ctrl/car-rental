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

    // KYC gates *actions*, not *reading* — which is what the message below
    // says. JwtAuthGuard hydrates req.user on @Public() routes too (see
    // guards.ts), so without this branch the gate reached plain reads: a
    // logged-in user with KYC still pending got 403 on GET /cars/search, the
    // search page drew its hero over an empty car grid, and the only thing on
    // screen was this message. Reads are already scoped to their caller by
    // RolesGuard, so they open up; anything that mutates still needs an
    // approved KYC, and @KycExempt remains for the writes a pending user must
    // be able to make — uploading KYC documents, editing their own profile.
    const method = (req.method || 'GET').toUpperCase();
    const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    if (!isRead && user.kyc_status !== 'approved') {
      throw new ForbiddenException('KYC not approved yet — account actions are locked');
    }
    return true;
  }
}
