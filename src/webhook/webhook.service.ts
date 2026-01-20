import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../shared/entities/workflow.entity';
import { WorkflowRun, WorkflowRunStatus } from '../shared/entities/workflow-run.entity';
import { LoggingService } from '../shared/logging/logging.service';
import { CacheService } from '../shared/cache/cache.service';

/**
 * WebhookService
 * 
 * Handles webhook triggers and workflow execution initiation.
 */
@Injectable()
export class WebhookService {
  private readonly CACHE_PREFIX = 'webhook:';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepository: Repository<WorkflowRun>,
    private readonly loggingService: LoggingService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Trigger a workflow by its trigger path
   * 
   * @param triggerPath - The unique trigger path (32-char hex)
   * @param payload - The request body/payload
   * @returns The workflow run result
   */
  async triggerWorkflow(
    triggerPath: string,
    payload: Record<string, any>,
  ): Promise<{
    runId: string;
    status: WorkflowRunStatus;
    message: string;
    data?: any;
  }> {
    this.loggingService.info(
      `triggerWorkflow - Started: triggerPath=${triggerPath}`,
      'WebhookService',
      { triggerPath, payloadSize: JSON.stringify(payload).length },
    );

    try {
      // Try to get workflow from cache first
      const cacheKey = `${this.CACHE_PREFIX}${triggerPath}`;
      let workflow: Workflow | null = null;
      const cachedWorkflow = await this.cacheService.get<Workflow>(cacheKey);
      
      if (cachedWorkflow) {
        workflow = cachedWorkflow;
        this.loggingService.debug(
          `triggerWorkflow - Workflow found in cache: ${workflow.id}`,
          'WebhookService',
        );
      } else {
        // Lookup workflow by trigger path
        workflow = await this.workflowRepository.findOne({
          where: { triggerPath },
        });

        if (!workflow) {
          this.loggingService.warn(
            `triggerWorkflow - Workflow not found: triggerPath=${triggerPath}`,
            'WebhookService',
          );
          throw new NotFoundException(
            `Workflow with trigger path '${triggerPath}' not found`,
          );
        }

        // Cache the workflow
        await this.cacheService.set(cacheKey, workflow, this.CACHE_TTL);
      }

      // Check if workflow is enabled
      if (!workflow.enabled) {
        this.loggingService.warn(
          `triggerWorkflow - Workflow is disabled: ${workflow.id}`,
          'WebhookService',
          { workflowId: workflow.id, triggerPath },
        );
        throw new ForbiddenException(
          `Workflow '${workflow.name}' is currently disabled`,
        );
      }

      // Create a workflow run record
      const workflowRun = this.workflowRunRepository.create({
        workflowId: workflow.id,
        userId: workflow.userId,
        status: WorkflowRunStatus.RUNNING,
        inputContext: payload, // Store the trigger payload
        stepCount: workflow.steps?.length || 0,
        currentStep: 0,
      });

      const savedRun = await this.workflowRunRepository.save(workflowRun);

      this.loggingService.info(
        `triggerWorkflow - Workflow run created: ${savedRun.id}`,
        'WebhookService',
        {
          workflowId: workflow.id,
          runId: savedRun.id,
          triggerPath,
        },
      );

      // TODO: Execute workflow steps (will be implemented in execution engine)
      // For now, we'll just mark it as success
      const result = await this.executeWorkflowSteps(workflow, savedRun, payload);

      this.loggingService.info(
        `triggerWorkflow - Completed: runId=${savedRun.id}, status=${result.status}`,
        'WebhookService',
        {
          workflowId: workflow.id,
          runId: savedRun.id,
          status: result.status,
        },
      );

      return {
        runId: savedRun.id,
        status: result.status,
        message: result.message,
        data: result.data,
      };
    } catch (error) {
      this.loggingService.error(
        `triggerWorkflow - Error: ${error.message}`,
        error.stack,
        'WebhookService',
        { triggerPath, error: error.message },
      );
      throw error;
    }
  }

  /**
   * Execute workflow steps (placeholder for now)
   * This will be replaced by the execution engine
   * 
   * @param workflow - The workflow to execute
   * @param workflowRun - The workflow run record
   * @param payload - The initial payload/context
   * @returns The execution result
   */
  private async executeWorkflowSteps(
    workflow: Workflow,
    workflowRun: WorkflowRun,
    payload: Record<string, any>,
  ): Promise<{
    status: WorkflowRunStatus;
    message: string;
    data?: any;
  }> {
    this.loggingService.info(
      `executeWorkflowSteps - Started: workflowId=${workflow.id}, runId=${workflowRun.id}`,
      'WebhookService',
    );

    try {
      // TODO: This is a placeholder implementation
      // The actual execution engine will be implemented next
      
      // For now, just validate that workflow has steps
      if (!workflow.steps || workflow.steps.length === 0) {
        workflowRun.status = WorkflowRunStatus.SUCCESS;
        workflowRun.completedAt = new Date();
        workflowRun.durationMs = Date.now() - workflowRun.startedAt.getTime();
        workflowRun.outputContext = { message: 'No steps to execute' };
        await this.workflowRunRepository.save(workflowRun);

        return {
          status: WorkflowRunStatus.SUCCESS,
          message: 'Workflow has no steps to execute',
          data: payload,
        };
      }

      // Placeholder: Mark as success with step count
      workflowRun.status = WorkflowRunStatus.SUCCESS;
      workflowRun.completedAt = new Date();
      workflowRun.durationMs = Date.now() - workflowRun.startedAt.getTime();
      workflowRun.outputContext = {
        message: 'Workflow triggered successfully (execution engine pending)',
        stepCount: workflow.steps.length,
        ...payload,
      };
      await this.workflowRunRepository.save(workflowRun);

      this.loggingService.info(
        `executeWorkflowSteps - Completed: runId=${workflowRun.id}`,
        'WebhookService',
        { stepCount: workflow.steps.length },
      );

      return {
        status: WorkflowRunStatus.SUCCESS,
        message: `Workflow triggered successfully. ${workflow.steps.length} steps queued for execution.`,
        data: {
          context: payload,
          stepCount: workflow.steps.length,
        },
      };
    } catch (error) {
      this.loggingService.error(
        `executeWorkflowSteps - Error: ${error.message}`,
        error.stack,
        'WebhookService',
        { workflowId: workflow.id, runId: workflowRun.id },
      );

      // Update run status to failed
      workflowRun.status = WorkflowRunStatus.FAILED;
      workflowRun.completedAt = new Date();
      workflowRun.durationMs = Date.now() - workflowRun.startedAt.getTime();
      workflowRun.errorDetails = {
        message: error.message,
        stack: error.stack,
      };
      await this.workflowRunRepository.save(workflowRun);

      return {
        status: WorkflowRunStatus.FAILED,
        message: `Workflow execution failed: ${error.message}`,
      };
    }
  }

  /**
   * Get workflow by trigger path (for validation)
   * 
   * @param triggerPath - The trigger path
   * @returns The workflow or null
   */
  async findWorkflowByTriggerPath(triggerPath: string): Promise<Workflow | null> {
    this.loggingService.debug(
      `findWorkflowByTriggerPath - Looking up: ${triggerPath}`,
      'WebhookService',
    );

    const workflow = await this.workflowRepository.findOne({
      where: { triggerPath },
    });

    return workflow;
  }
}
