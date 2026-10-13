import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { LogsController } from './logs.controller';

@Module({
  controllers: [HealthController, LogsController],
})
export class HealthModule {}
