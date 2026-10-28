import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { runMigrations } from './common/db/database';
import { safeDbError } from './common/db/database';
import { dbReadiness, setDbPhase } from './common/db/readiness';
import { ensureSuperAdmin } from './ensure-admin';
import { ensureDemoFleet } from './seed-fleet';
import { ensureDemoHistory } from './seed-history';
import { AppModule } from './app.module';
import { servePortals } from './serve-portals';
import { DbUnavailableFilter } from './common/filters/db-unavailable.filter';
import { BookingsService } from './modules/bookings/bookings.service';
import { FleetService } from './modules/fleet/fleet.service';

/**
 * Spacing between boot-time database attempts.
 *
 * A managed Postgres that has been asleep, is still starting, or is briefly
 * unreachable should not cost a deploy: the retry loop keeps trying while the
 * HTTP server is already answering. Fifteen seconds is slow enough not to
 * hammer a struggling database and fast enough that a recovered one is usable
 * almost immediately.
 */
const INIT_RETRY_MS = Number(process.env.DB_INIT_RETRY_MS || 15000);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

/**
 * Migrations (and, in production, the super-admin seed) run *after* the port is
 * open.
 *
 * This used to be the first thing bootstrap() awaited. On a host that decides a
 * deploy succeeded by whether the port answers, a database that never answered
 * therefore produced the worst possible failure mode: the container was up,
 * connections were accepted, and nothing was ever sent back. No 502, no log
 * line the platform surfaces, no page — just a request that hangs.
 *
 * Now the socket opens first and this loop reports through /api/health, so the
 * portals are reachable immediately and a database problem is a visible
 * "degraded" answer instead of a silent hang.
 */
async function initializeDatabase(isProd: boolean): Promise<boolean> {
  // No attempt ceiling: a paused or not-yet-created database is a wait, not a
  // verdict, and giving up would leave a healthy container serving 500s until
  // someone redeployed it. The first few failures are logged in full, then one
  // line every twentieth attempt so a long outage does not flood the log.
  for (;;) {
    dbReadiness.attempts += 1;
    setDbPhase('migrating');
    try {
      await runMigrations();
      if (isProd) {
        await ensureSuperAdmin();
        // A freshly migrated database has a catalogue nobody can browse yet.
        // This only ever fills an empty fleet, and a failure here must not
        // hold the boot loop hostage, so it is reported and moved past.
        try {
          await ensureDemoFleet();
        } catch (e) {
          console.warn('[boot] demo fleet seed skipped:', safeDbError(e));
        }
        // Trips and reviews give that fleet a history; same rules, same safety:
        // idempotent, and a failure here must not block the boot either.
        try {
          await ensureDemoHistory();
        } catch (e) {
          console.warn('[boot] demo history seed skipped:', safeDbError(e));
        }
      }
      dbReadiness.migrated = true;
      setDbPhase('ready');
      console.log(`[boot] database ready (attempt ${dbReadiness.attempts})`);
      return true;
    } catch (e) {
      const message = safeDbError(e);
      setDbPhase('failed', message);
      const loud =
        dbReadiness.attempts <= 3 || dbReadiness.attempts % 20 === 0;
      if (loud) {
        console.error(`[boot] database init failed (attempt ${dbReadiness.attempts}): ${message}`);
        // The stack names the code path (and the pg error code) that the
        // one-line summary cannot; it is what made the last outage diagnosable.
        console.error(e);
      }
      await sleep(INIT_RETRY_MS);
    }
  }
}

/** Work that needs the database, kept out of the listen path for the same reason. */
async function afterDatabase(app: NestExpressApplication): Promise<void> {
  try {
    // keep the booking module's car cache in sync with the fleet at boot
    const fleet = await app.get(FleetService);
    await fleet.syncCarCache();
  } catch (e) {
    console.warn('[boot] car_cache sync skipped:', safeDbError(e));
  }

  const bookings = await app.get(BookingsService);
  // periodic sweep: auto deposit refunds after the dispute window
  setInterval(async () => {
    try {
      await bookings.sweepSettlements();
    } catch {
      /* logged by the sqlite layer */
    }
  }, 10 * 60 * 1000).unref();
}

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true, credentials: true });
  // A database that is not there yet is a retryable 503, not an anonymous 500.
  app.useGlobalFilters(new DbUnavailableFilter());

  if (isProd) {
    // In production the API and the five portals share one origin (Render's free
    // tier is a single web service). Moving every controller under /api frees
    // the root for one path prefix per portal (/renter, /owner, ...), and the
    // portals already call /api/... so their fetches need no change.
    app.setGlobalPrefix('api');

    // Two things still address uploads at the root rather than /api: the portals
    // render <img src="/uploads/uuid.ext"> straight from the storage URL, while
    // documentBlob() fetches BASE + '/uploads/...'. FilesController lives at
    // /api/uploads under the prefix, so rewrite the root form onto it.
    app.use((req: any, _res: any, next: () => void) => {
      if (typeof req.url === 'string' && req.url.startsWith('/uploads')) {
        req.url = '/api' + req.url;
      }
      next();
    });
  }

  // Static portal hosting only in production, and registered before listen()
  // so it sits ahead of the controller router; in dev each portal is its own
  // Vite server on :5173-:5177 and nothing here should serve files.
  if (isProd) servePortals(app);

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);

  // Deliberately not awaited: the port is up, so a slow or unreachable database
  // can no longer hold the service hostage. Progress and failures are reported
  // by /api/health and the log above.
  void initializeDatabase(isProd).then((ok) => {
    if (ok) void afterDatabase(app);
  });
}

bootstrap().catch((error) => {
  console.error('API startup failed:', safeDbError(error));
  process.exitCode = 1;
});
