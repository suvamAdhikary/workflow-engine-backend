import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { LoggingService } from './logging.service';
import { LogCollectorService } from './log-collector.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LoggingService, LogCollectorService],
  exports: [LoggingService, LogCollectorService],
})
export class LoggingModule {}