import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { getDb } from '../db/database';
import { Role } from './roles';

/**
 * The signing secret, resolved once at import.
 *
 * A configured value is used as-is, except in production where a short one or
 * the development default is refused outright: either would let anyone who has
 * read this repository mint a valid token for any role.
 *
 * A production process with *no* secret used to throw during module
 * evaluation. On a platform that decides a deploy succeeded by whether a port
 * opens, that exception was the whole story the deployment page ever showed —
 * "No open ports detected" — with the actual reason buried in the log. So an
 * unset secret now gets a random one for the life of the process: tokens stay
 * unforgeable, the service comes up, the compromise (sessions do not survive a
 * restart) is logged loudly, reported by /api/health, and fixed for good by
 * setting JWT_SECRET in the service environment.
 */
function resolveJwtSecret(): { secret: string; ephemeral: boolean } {
  const provided = (process.env.JWT_SECRET || '').trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (provided && isProd && (provided.length < 32 || provided === 'dev-secret-change-me')) {
    throw new Error(
      'Production requires a unique JWT_SECRET of at least 32 characters; the configured value is too short or a placeholder',
    );
  }
  if (provided) return { secret: provided, ephemeral: false };
  if (!isProd) return { secret: 'dev-secret-change-me', ephemeral: false };

  const generated = randomBytes(48).toString('base64url');
  console.warn(
    '[auth] JWT_SECRET is not set — generated an ephemeral signing secret for this process.\n' +
      '       Sign-in works, but every session ends when the service restarts.\n' +
      '       Set JWT_SECRET (32+ random characters) in the service environment to make sessions durable.',
  );
  return { secret: generated, ephemeral: true };
}

const jwtSecret = resolveJwtSecret();
export const JWT_SECRET = jwtSecret.secret;
/** True when the secret was generated because none was configured. Reported by /api/health. */
export const JWT_SECRET_EPHEMERAL = jwtSecret.ephemeral;

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
