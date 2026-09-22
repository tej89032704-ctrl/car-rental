import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { getDb } from '../db/database';
import { Role } from './roles';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export interface RequestUser {
  id: string;
  role: Role;
  kyc_status: string;
  status: string;
}

function loadUser(userId: string): RequestUser | null {
  const row = getDb('auth')
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

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing token');
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as { sub: string };
      const user = loadUser(payload.sub);
      if (!user) throw new Error('user gone');
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
