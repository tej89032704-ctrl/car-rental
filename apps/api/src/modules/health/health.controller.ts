import { Controller, Get } from '@nestjs/common';
import { JWT_SECRET_EPHEMERAL, Public } from '../../common/auth/guards';
import { KycExempt } from '../../common/auth/kyc-gate.guard';
import { probeDatabase } from '../../common/db/database';
import { dbReadiness } from '../../common/db/readiness';

/**
 * Liveness and dependency report.
 *
 * Reached at /api/health in production (the global prefix) and /health in
 * local development. It is deliberately public and cheap: a platform health
 * check has no account, and the whole point is to answer when something else
 * is wrong.
 *
 * The status code is 200 whenever the process can answer at all — that is what
 * "is this instance alive" means, and it is what keeps a database outage from
 * turning into a failed deploy. Whether Postgres is actually reachable is in
 * the body, so the answer is never a guess:
 *
 *   { "status": "ok", "database": { "ok": true, "phase": "ready", ... } }
 *   { "status": "degraded", "database": { "ok": false, "phase": "failed",
 *     "error": "connect ECONNREFUSED 10.0.0.5:5432" } }
 */
@Controller('health')
@Public()
@KycExempt()
export class HealthController {
  @Get()
  async check() {
    const db = await probeDatabase(4000);
    return {
      status: db.ok ? 'ok' : 'degraded',
      uptime_seconds: Math.round(process.uptime()),
      // "generated" means the service is running without a configured
      // JWT_SECRET: sign-in works, but a restart signs everybody out.
      jwt_secret: JWT_SECRET_EPHEMERAL ? 'generated' : 'configured',
      database: {
        ok: db.ok,
        phase: dbReadiness.phase,
        migrated: dbReadiness.migrated,
        attempts: dbReadiness.attempts,
        ...(db.ok ? {} : { error: db.error ?? dbReadiness.message ?? 'unavailable' }),
      },
    };
  }
}
