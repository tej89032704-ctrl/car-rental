import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { runMigrations } from './common/db/database';
import { AppModule } from './app.module';
import { BookingsService } from './modules/bookings/bookings.service';
import { FleetService } from './modules/fleet/fleet.service';

async function bootstrap() {
  await runMigrations();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true, credentials: true });
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
