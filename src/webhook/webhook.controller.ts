import {
  Controller,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { Public } from '../auth/decorators/public.decorator';
import { LoggingService } from '../shared/logging/logging.service';

/**
 * WebhookController
 * 
 * Handles webhook trigger endpoints.
 * These endpoints are PUBLIC and do not require authentication.
 */
@ApiTags('Webhook Triggers')
@Controller('t')
@Public() // Webhook triggers are public
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Trigger a workflow via its unique trigger path
   * 
   * POST /t/:triggerPath
   * 
   * @param triggerPath - The unique 32-character hex trigger path
   * @param payload - The request body (any JSON payload)
   * @returns The workflow execution result
   */
  @Post(':triggerPath')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger a workflow',
    description: `
      Triggers a workflow execution via its unique trigger URL.
      
      The trigger path is a 32-character hexadecimal string that uniquely identifies a workflow.
      The request body will be used as the initial context (ctx) for the workflow execution.
      
      **Behavior:**
      - If the workflow is enabled: Executes the workflow and returns the run status
      - If the workflow is disabled: Returns 403 Forbidden
      - If the trigger path doesn't exist: Returns 404 Not Found
      
      **Response Statuses:**
      - \`success\`: All steps executed successfully
      - \`failed\`: One or more steps failed
      - \`skipped\`: Workflow was short-circuited by a filter step
      - \`running\`: Execution is in progress (async workflows)
    `,
  })
  @ApiParam({
    name: 'triggerPath',
    description: 'Unique 32-character hexadecimal trigger path',
    example: '09bf16a73d6cb52eccef42f90406199c',
    required: true,
  })
  @ApiBody({
    description: 'Request payload (will be used as workflow context)',
    schema: {
      type: 'object',
      example: {
        type: 'lock.unlock',
        success: false,
        actor_name: 'John Doe',
        timestamp: '2026-01-20T10:30:00Z',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow triggered successfully',
    schema: {
      type: 'object',
      properties: {
        runId: {
          type: 'string',
          description: 'Unique identifier for this workflow run',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
        status: {
          type: 'string',
          enum: ['success', 'failed', 'skipped', 'running'],
          description: 'Current status of the workflow run',
          example: 'success',
        },
        message: {
          type: 'string',
          description: 'Human-readable status message',
          example: 'Workflow triggered successfully. 3 steps queued for execution.',
        },
        data: {
          type: 'object',
          description: 'Additional data (context, results, etc.)',
          nullable: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Workflow is disabled',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: "Workflow 'My Workflow' is currently disabled" },
        error: { type: 'string', example: 'Forbidden' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: "Workflow with trigger path 'abc123...' not found" },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  async triggerWorkflow(
    @Param('triggerPath') triggerPath: string,
    @Body() payload: Record<string, any>,
  ): Promise<{
    data: {
      runId: string;
      status: string;
      context?: any;
      stepCount?: number;
    };
    message: string;
  }> {
    this.loggingService.info(
      `POST /t/${triggerPath} - Workflow trigger request received`,
      'WebhookController',
      {
        triggerPath,
        payloadKeys: Object.keys(payload),
      },
    );

    const result = await this.webhookService.triggerWorkflow(triggerPath, payload);

    this.loggingService.info(
      `POST /t/${triggerPath} - Workflow trigger completed: ${result.status}`,
      'WebhookController',
      {
        runId: result.runId,
        status: result.status,
      },
    );

    // Return in format that works with Transform interceptor
    return {
      data: {
        runId: result.runId,
        status: result.status,
        ...(result.data || {}),
      },
      message: result.message,
    };
  }
}
