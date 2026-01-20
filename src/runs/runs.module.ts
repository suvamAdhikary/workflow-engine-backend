import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { WorkflowRun } from '../shared/entities/workflow-run.entity';
import { Workflow } from '../shared/entities/workflow.entity';
import { CacheModule } from '../shared/cache/cache.module';
import { LoggingModule } from '../shared/logging/logging.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowRun, Workflow]),
    CacheModule,
    LoggingModule,
  ],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
