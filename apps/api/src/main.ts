import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import { runMigrations } from './common/db/database';
import { AppModule } from './app.module';
import { BookingsService } from './modules/bookings/bookings.service';
import { FleetService } from './modules/fleet/fleet.service';

async function bootstrap() {
  runMigrations();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.useStaticAssets(path.resolve(__dirname, '../../uploads'), { prefix: '/uploads/' });
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);

  const bookings = app.get(BookingsService);
  // keep the booking module's car cache in sync with the fleet at boot
  const fleet = app.get(FleetService);
  try { fleet.syncCarCache(); } catch (e) { console.warn('car_cache sync failed:', String(e)); }

  // periodic settlement sweep (deposit refunds + owner payouts after dispute window)
  setInterval(() => {
    try { bookings.sweepSettlements(); } catch { /* logged by sqlite layer */ }
  }, 10 * 60 * 1000).unref();

  console.log(`API running on http://localhost:${port}`);
}
bootstrap();
