import { Module } from '@nestjs/common';
import { FleetService } from './fleet.service';
import { FleetController } from './fleet.controller';
import { CarVerificationService } from './car-verification.service';
import { StorageService } from '../../common/db/storage.service';

@Module({
  providers: [FleetService, CarVerificationService, StorageService],
  controllers: [FleetController],
  exports: [FleetService, CarVerificationService],
})
export class FleetModule {}