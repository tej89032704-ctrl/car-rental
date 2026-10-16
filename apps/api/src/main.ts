import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { runMigrations } from './common/db/database';
import { ensureSuperAdmin } from './ensure-admin';
import { AppModule } from './app.module';
import { servePortals } from './serve-portals';
import { BookingsService } from './modules/bookings/bookings.service';
import { FleetService } from './modules/fleet/fleet.service';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  await runMigrations();

  // A freshly migrated production database has tables but no accounts, which
  // would leave the admin portal with no way in at all. Creating the super
  // admin here is idempotent, so every later boot just confirms it exists.
  if (isProd) await ensureSuperAdmin();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true, credentials: true });

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

  const bookings = await app.get(BookingsService);
  // keep the booking module's car cache in sync with the fleet at boot
  const fleet = await app.get(FleetService);
  try { await fleet.syncCarCache(); } catch (e) { console.warn('car_cache sync failed:', String(e)); }

  // periodic sweep: auto deposit refunds after the dispute window
  setInterval(async () => {
    try { await bookings.sweepSettlements(); } catch { /* logged by sqlite layer */ }
  }, 10 * 60 * 1000).unref();

  console.log(`API running on http://localhost:${port}`);
}
bootstrap().catch((error) => {
  console.error('API startup failed:', error);
  process.exitCode = 1;
});
