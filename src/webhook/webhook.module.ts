import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { Workflow } from '../shared/entities/workflow.entity';
import { WorkflowRun } from '../shared/entities/workflow-run.entity';
import { LoggingModule } from '../shared/logging/logging.module';
import { CacheModule } from '../shared/cache/cache.module';
import { ExecutionModule } from '../execution/execution.module';

/**
 * WebhookModule
 * 
 * Handles webhook triggers for workflows.
 * Provides dynamic routing to execute workflows via their unique trigger URLs.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, WorkflowRun]),
    LoggingModule,
    CacheModule,
    ExecutionModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
