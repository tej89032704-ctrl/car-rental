import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsModule } from '../bookings/bookings.module';
import { FleetModule } from '../fleet/fleet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PaymentsModule, BookingsModule, FleetModule, NotificationsModule, AuthModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
