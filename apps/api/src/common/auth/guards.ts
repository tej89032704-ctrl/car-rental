import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { getDb } from '../db/database';
import { Role } from './roles';

export const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret-change-me');
if (!JWT_SECRET || (process.env.NODE_ENV === 'production' && (JWT_SECRET.length < 32 || JWT_SECRET === 'dev-secret-change-me'))) {
  throw new Error('Production requires a unique JWT_SECRET of at least 32 characters');
}

export interface RequestUser {
  id: string;
  role: Role;
  kyc_status: string;
  status: string;
}

async function loadUser(userId: string): Promise<RequestUser | null> {
  const row = await getDb('auth')
    .prepare(`SELECT id, role, status, kyc_status FROM users WHERE id = ? AND is_deleted = 0`)
    .get(userId) as RequestUser | undefined;
  return row ?? null;
}

export const ROLES_KEY = 'allowed_roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'is_public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) {
      // Optional auth: if a valid Bearer token is presented, hydrate req.user so
      // public handlers (e.g. GET /cars/:id) can branch on the requester. An
      // invalid/absent token simply leaves the request anonymous.
      if (header?.startsWith('Bearer ')) {
        try {
          const payload = jwt.verify(header.slice(7), JWT_SECRET) as { sub: string; scope?: string };
          if (payload.scope) throw new Error('Challenge tokens are not access tokens');
          const user = await loadUser(payload.sub);
          if (user && !['suspended', 'banned'].includes(user.status)) req.user = user;
        } catch { /* anonymous access is still allowed */ }
      }
      return true;
    }

    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing token');
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as { sub: string; scope?: string };
          if (payload.scope) throw new Error('Challenge tokens are not access tokens');
      const user = await loadUser(payload.sub);
      if (!user || ['suspended', 'banned'].includes(user.status)) throw new Error('Account unavailable');
      req.user = user;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) {
      throw new ForbiddenException('Endpoint has no role declaration (RBAC violation)');
    }
    const req = ctx.switchToHttp().getRequest();
    const user: RequestUser | undefined = req.user;
    if (!user) throw new UnauthorizedException();
    if (!required.includes(user.role)) throw new ForbiddenException('Access denied for your role');
    return true;
  }
}
