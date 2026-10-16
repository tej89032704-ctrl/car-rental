import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { KycService } from './kyc.service';
import { FilesController } from './files.controller';
import { AuthController } from './auth.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageService } from '../../common/db/storage.service';

@Module({
  imports: [NotificationsModule],
  providers: [AuthService, KycService, StorageService],
  controllers: [AuthController, FilesController],
  exports: [AuthService, KycService],
})
export class AuthModule {}
