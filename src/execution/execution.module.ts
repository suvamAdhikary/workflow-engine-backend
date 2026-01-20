import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionService } from './execution.service';
import { ContextManager } from './context.manager';
import { FilterProcessor } from './processors/filter.processor';
import { TransformProcessor } from './processors/transform.processor';
import { HttpRequestProcessor } from './processors/http-request.processor';
import { WorkflowRun } from '../shared/entities/workflow-run.entity';
import { LoggingModule } from '../shared/logging/logging.module';

/**
 * ExecutionModule
 * 
 * Provides workflow execution capabilities.
 * Includes step processors, context management, and execution orchestration.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowRun]),
    LoggingModule,
  ],
  providers: [
    ExecutionService,
    ContextManager,
    FilterProcessor,
    TransformProcessor,
    HttpRequestProcessor,
  ],
  exports: [ExecutionService, ContextManager],
})
export class ExecutionModule {}
