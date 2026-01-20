import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../shared/entities/workflow.entity';
import { WorkflowRun, WorkflowRunStatus } from '../shared/entities/workflow-run.entity';
import { LoggingService } from '../shared/logging/logging.service';
import { ContextManager } from './context.manager';
import { FilterProcessor } from './processors/filter.processor';
import { TransformProcessor } from './processors/transform.processor';
import { HttpRequestProcessor } from './processors/http-request.processor';
import { IStepProcessor, StepExecutionResult } from './interfaces/step-processor.interface';

/**
 * ExecutionService
 * 
 * Main orchestrator for workflow execution.
 * Executes steps sequentially and manages the workflow run lifecycle.
 */
@Injectable()
export class ExecutionService {
  private readonly stepProcessors: Map<string, IStepProcessor>;

  constructor(
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepository: Repository<WorkflowRun>,
    private readonly contextManager: ContextManager,
    private readonly filterProcessor: FilterProcessor,
    private readonly transformProcessor: TransformProcessor,
    private readonly httpRequestProcessor: HttpRequestProcessor,
    private readonly loggingService: LoggingService,
  ) {
    // Register step processors
    this.stepProcessors = new Map<string, IStepProcessor>([
      ['filter', this.filterProcessor],
      ['transform', this.transformProcessor],
      ['http_request', this.httpRequestProcessor],
    ]);
  }

  /**
   * Execute a workflow
   * 
   * @param workflow - The workflow to execute
   * @param workflowRun - The workflow run record
   * @param initialContext - The initial context (trigger payload)
   * @returns The final execution result
   */
  async execute(
    workflow: Workflow,
    workflowRun: WorkflowRun,
    initialContext: Record<string, any>,
  ): Promise<{
    status: WorkflowRunStatus;
    context: Record<string, any>;
    error?: any;
  }> {
    this.loggingService.info(
      `ExecutionService - Starting workflow execution: ${workflow.id}`,
      'ExecutionService',
      {
        workflowId: workflow.id,
        runId: workflowRun.id,
        stepCount: workflow.steps?.length || 0,
      },
    );

    // Initialize context
    let context = this.contextManager.clone(initialContext);
    let currentStep = 0;

    try {
      // Validate workflow has steps
      if (!workflow.steps || workflow.steps.length === 0) {
        this.loggingService.warn(
          `ExecutionService - Workflow has no steps: ${workflow.id}`,
          'ExecutionService',
        );

        return {
          status: WorkflowRunStatus.SUCCESS,
          context,
        };
      }

      // Execute steps sequentially
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        currentStep = i;

        this.loggingService.info(
          `ExecutionService - Executing step ${i + 1}/${workflow.steps.length}: ${step.type}`,
          'ExecutionService',
          { stepIndex: i, stepType: step.type },
        );

        // Update workflow run progress
        await this.updateRunProgress(workflowRun, i, context);

        // Execute the step
        const result = await this.executeStep(step, context);

        // Update context
        context = result.context;

        // Check if execution should continue
        if (!result.success) {
          // Step failed - stop execution
          this.loggingService.error(
            `ExecutionService - Step ${i + 1} failed, stopping execution`,
            undefined,
            'ExecutionService',
            { stepIndex: i, error: result.error },
          );

          return {
            status: WorkflowRunStatus.FAILED,
            context,
            error: {
              step: i,
              stepType: step.type,
              ...result.error,
            },
          };
        }

        if (result.shouldSkip) {
          // Filter step short-circuited - stop execution with skipped status
          this.loggingService.info(
            `ExecutionService - Step ${i + 1} triggered skip, stopping execution`,
            'ExecutionService',
            { stepIndex: i },
          );

          return {
            status: WorkflowRunStatus.SKIPPED,
            context,
          };
        }

        this.loggingService.debug(
          `ExecutionService - Step ${i + 1} completed successfully`,
          'ExecutionService',
        );
      }

      // All steps completed successfully
      this.loggingService.info(
        `ExecutionService - Workflow execution completed successfully: ${workflow.id}`,
        'ExecutionService',
        { runId: workflowRun.id },
      );

      return {
        status: WorkflowRunStatus.SUCCESS,
        context,
      };
    } catch (error) {
      this.loggingService.error(
        `ExecutionService - Unexpected error during execution: ${error.message}`,
        error.stack,
        'ExecutionService',
        {
          workflowId: workflow.id,
          runId: workflowRun.id,
          currentStep,
          error: error.message,
        },
      );

      return {
        status: WorkflowRunStatus.FAILED,
        context,
        error: {
          step: currentStep,
          message: error.message,
          stack: error.stack,
          code: 'EXECUTION_ERROR',
        },
      };
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: Record<string, any>,
    context: Record<string, any>,
  ): Promise<StepExecutionResult> {
    const stepType = step.type;

    if (!stepType) {
      throw new Error('Step missing "type" field');
    }

    const processor = this.stepProcessors.get(stepType);

    if (!processor) {
      throw new Error(`Unknown step type: ${stepType}`);
    }

    this.loggingService.debug(
      `ExecutionService - Executing ${stepType} step`,
      'ExecutionService',
    );

    return await processor.execute(step, context);
  }

  /**
   * Update workflow run progress
   */
  private async updateRunProgress(
    workflowRun: WorkflowRun,
    currentStep: number,
    context: Record<string, any>,
  ): Promise<void> {
    try {
      workflowRun.currentStep = currentStep;
      workflowRun.outputContext = context;
      await this.workflowRunRepository.save(workflowRun);
    } catch (error) {
      // Log error but don't fail the execution
      this.loggingService.error(
        'ExecutionService - Failed to update run progress',
        error.stack,
        'ExecutionService',
        { runId: workflowRun.id, currentStep },
      );
    }
  }
}
