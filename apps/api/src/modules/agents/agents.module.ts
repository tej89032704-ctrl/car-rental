import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [AgentsService],
  controllers: [AgentsController],
})
export class AgentsModule {}
