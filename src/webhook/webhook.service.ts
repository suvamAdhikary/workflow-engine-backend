import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../shared/entities/workflow.entity';
import { WorkflowRun, WorkflowRunStatus } from '../shared/entities/workflow-run.entity';
import { LoggingService } from '../shared/logging/logging.service';
import { CacheService } from '../shared/cache/cache.service';
import { ExecutionService } from '../execution/execution.service';
import { InputSanitizer } from '../shared/utils/input-sanitizer';

/**
 * WebhookService
 * 
 * Handles webhook triggers and workflow execution initiation.
 */
@Injectable()
export class WebhookService {
  private readonly CACHE_PREFIX = 'webhook:';
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly DEDUP_PREFIX = 'dedup:';
  private readonly DEDUP_TTL = 60; // 1 minute deduplication window

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(WorkflowRun)
    private readonly workflowRunRepository: Repository<WorkflowRun>,
    private readonly loggingService: LoggingService,
    private readonly cacheService: CacheService,
    private readonly executionService: ExecutionService,
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
      // Sanitize and validate the input payload
      const sanitizedPayload = InputSanitizer.sanitizePayload(payload);
      
      // Check for duplicate requests (simple deduplication based on trigger path + payload hash)
      const payloadHash = this.generatePayloadHash(sanitizedPayload);
      const dedupKey = `${this.DEDUP_PREFIX}${triggerPath}:${payloadHash}`;
      const isDuplicate = await this.cacheService.get(dedupKey);
      
      if (isDuplicate) {
        this.loggingService.warn(
          `triggerWorkflow - Duplicate request detected: triggerPath=${triggerPath}`,
          'WebhookService',
          { triggerPath, payloadHash },
        );
        // Return the existing run ID from cache
        return isDuplicate as any;
      }
      
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
        inputContext: sanitizedPayload, // Store the sanitized trigger payload
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

      // Execute workflow steps with sanitized payload
      const result = await this.executeWorkflowSteps(workflow, savedRun, sanitizedPayload);

      // Cache the result for deduplication
      const response = {
        runId: savedRun.id,
        status: result.status,
        message: result.message,
        data: result.data,
      };
      await this.cacheService.set(dedupKey, response, this.DEDUP_TTL);

      this.loggingService.info(
        `triggerWorkflow - Completed: runId=${savedRun.id}, status=${result.status}`,
        'WebhookService',
        {
          workflowId: workflow.id,
          runId: savedRun.id,
          status: result.status,
        },
      );

      return response;
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
   * Execute workflow steps using the execution engine with timeout protection
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
      // Execute workflow using the execution engine with timeout protection
      const EXECUTION_TIMEOUT_MS = 30000; // 30 seconds timeout
      
      const executionPromise = this.executionService.execute(
        workflow,
        workflowRun,
        payload,
      );
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Workflow execution timeout after ${EXECUTION_TIMEOUT_MS}ms`));
        }, EXECUTION_TIMEOUT_MS);
      });
      
      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Update workflow run with results
      workflowRun.status = result.status;
      workflowRun.completedAt = new Date();
      workflowRun.durationMs = Date.now() - workflowRun.startedAt.getTime();
      workflowRun.outputContext = result.context;

      if (result.error) {
        workflowRun.errorDetails = result.error;
      }

      await this.workflowRunRepository.save(workflowRun);

      this.loggingService.info(
        `executeWorkflowSteps - Completed: runId=${workflowRun.id}, status=${result.status}`,
        'WebhookService',
        { status: result.status },
      );

      // Build response message
      let message: string;
      switch (result.status) {
        case WorkflowRunStatus.SUCCESS:
          message = `Workflow executed successfully. ${workflow.steps.length} steps completed.`;
          break;
        case WorkflowRunStatus.SKIPPED:
          message = 'Workflow execution skipped due to filter conditions.';
          break;
        case WorkflowRunStatus.FAILED:
          message = `Workflow execution failed: ${result.error?.message || 'Unknown error'}`;
          break;
        default:
          message = `Workflow execution status: ${result.status}`;
      }

      return {
        status: result.status,
        message,
        data: {
          context: result.context,
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

  /**
   * Generate a hash for payload deduplication
   * @param payload - The sanitized payload
   * @returns Hash string
   */
  private generatePayloadHash(payload: Record<string, any>): string {
    // Simple hash based on JSON string (in production, use crypto.createHash)
    const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
    let hash = 0;
    for (let i = 0; i < payloadStr.length; i++) {
      const char = payloadStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
