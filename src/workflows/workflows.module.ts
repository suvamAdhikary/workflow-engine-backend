import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { Workflow } from '../shared/entities/workflow.entity';
import { CacheModule } from '../shared/cache/cache.module';
import { LoggingModule } from '../shared/logging/logging.module';
import { RunsModule } from '../runs/runs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow]),
    CacheModule,
    LoggingModule,
    RunsModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
