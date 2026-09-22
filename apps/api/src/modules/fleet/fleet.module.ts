import { Module } from '@nestjs/common';
import { FleetService } from './fleet.service';
import { FleetController } from './fleet.controller';
import { StorageService } from '../../common/db/storage.service';

@Module({
  providers: [FleetService, StorageService],
  controllers: [FleetController],
  exports: [FleetService],
})
export class FleetModule {}
