import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
  ParseBoolPipe,
  ParseEnumPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto, UpdateWorkflowDto, WorkflowResponseDto, PaginatedWorkflowResponseDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../shared/entities/user.entity';
import { RunsService } from '../runs/runs.service';
import { PaginatedRunResponseDto } from '../runs/dto';
import { WorkflowRunStatus } from '../shared/entities/workflow-run.entity';

@ApiTags('Workflows')
@Controller('workflows')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly runsService: RunsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new workflow',
    description: `
      Creates a new workflow with a unique HTTP trigger URL.
      The trigger URL is automatically generated and cannot be changed.
      
      **Workflow Structure:**
      - Must have at least one step
      - Steps are executed sequentially
      - Supported step types: filter, transform, http_request
      
      **Step Types:**
      - **Filter**: Gate execution based on conditions (eq, neq operators)
      - **Transform**: Modify context data (template, default, pick operations)
      - **HTTP Request**: Call external APIs (GET, POST with retry support)
      
      **Example Use Cases:**
      - Send Slack notifications on specific events
      - Transform and forward webhook data
      - Filter and route events to different systems
    `,
  })
  @ApiBody({
    type: CreateWorkflowDto,
    description: 'Workflow configuration',
    examples: {
      'slack-notification': {
        summary: 'Slack Notification Workflow',
        description: 'Send a Slack message when a user signs up',
        value: {
          name: 'User Signup Notification',
          description: 'Sends a Slack notification when a new user signs up',
          enabled: true,
          trigger: {
            type: 'http',
          },
          steps: [
            {
              type: 'filter',
              conditions: [
                {
                  path: 'event_type',
                  op: 'eq',
                  value: 'user.signup',
                },
              ],
            },
            {
              type: 'transform',
              ops: [
                {
                  op: 'default',
                  path: 'user.name',
                  value: 'Anonymous',
                },
                {
                  op: 'template',
                  to: 'message',
                  template: 'New user signup: {{user.name}} ({{user.email}})',
                },
              ],
            },
            {
              type: 'http_request',
              method: 'POST',
              url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
              headers: {
                'Content-Type': 'application/json',
              },
              body: {
                mode: 'custom',
                value: {
                  text: '{{message}}',
                },
              },
              timeoutMs: 5000,
              retries: 3,
            },
          ],
        },
      },
      'data-transformation': {
        summary: 'Data Transformation Workflow',
        description: 'Transform and forward webhook data',
        value: {
          name: 'Data Transformation Pipeline',
          description: 'Transform incoming data and forward to external system',
          enabled: true,
          trigger: {
            type: 'http',
          },
          steps: [
            {
              type: 'transform',
              ops: [
                {
                  op: 'pick',
                  paths: ['id', 'email', 'timestamp'],
                },
                {
                  op: 'template',
                  to: 'formatted_date',
                  template: 'Received at {{timestamp}}',
                },
              ],
            },
            {
              type: 'http_request',
              method: 'POST',
              url: 'https://api.example.com/data',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'your-api-key',
              },
              body: {
                mode: 'ctx',
              },
              timeoutMs: 3000,
              retries: 2,
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Workflow created successfully',
    type: WorkflowResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid workflow structure or validation error',
    schema: {
      example: {
        statusCode: 400,
        message: 'Workflow must have at least one step',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createWorkflowDto: CreateWorkflowDto, @CurrentUser() user: User): Promise<WorkflowResponseDto> {
    return this.workflowsService.create(createWorkflowDto, user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all workflows',
    description: `
      Retrieves all workflows belonging to the authenticated user.
      Results are paginated and cached for improved performance.
      
      **Features:**
      - Pagination support (default: 20 per page)
      - Filter by enabled status
      - Results cached for 5 minutes
      - Sorted by creation date (newest first)
    `,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page',
    example: 20,
  })
  @ApiQuery({
    name: 'enabled',
    required: false,
    type: Boolean,
    description: 'Filter by enabled status',
    example: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Workflows retrieved successfully',
    type: PaginatedWorkflowResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('enabled') enabled?: string,
  ): Promise<PaginatedWorkflowResponseDto> {
    const enabledFilter = enabled !== undefined ? enabled === 'true' : undefined;
    return this.workflowsService.findAll(user.id, page, limit, enabledFilter);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get workflow by ID',
    description: `
      Retrieves a specific workflow by its UUID.
      Results are cached for improved performance.
      
      **Permissions:**
      - Only the workflow owner can access it
      - Returns 403 Forbidden if not the owner
      - Returns 404 Not Found if workflow doesn't exist
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow retrieved successfully',
    type: WorkflowResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not the workflow owner' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User): Promise<WorkflowResponseDto> {
    return this.workflowsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update workflow',
    description: `
      Updates an existing workflow. Only the workflow owner can update it.
      
      **Update Rules:**
      - Trigger path cannot be changed (maintains unique URL)
      - All fields are optional (partial update)
      - Steps and trigger structure are validated if provided
      - Cached data is invalidated after update
      
      **Common Updates:**
      - Enable/disable workflow
      - Update workflow name or description
      - Modify workflow steps
      - Change step configurations
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiBody({
    type: UpdateWorkflowDto,
    description: 'Fields to update (all optional)',
    examples: {
      'disable-workflow': {
        summary: 'Disable Workflow',
        value: {
          enabled: false,
        },
      },
      'update-name': {
        summary: 'Update Name and Description',
        value: {
          name: 'Updated Workflow Name',
          description: 'Updated description',
        },
      },
      'update-steps': {
        summary: 'Update Workflow Steps',
        value: {
          steps: [
            {
              type: 'filter',
              conditions: [
                {
                  path: 'status',
                  op: 'eq',
                  value: 'active',
                },
              ],
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow updated successfully',
    type: WorkflowResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid update data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not the workflow owner' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
    @CurrentUser() user: User,
  ): Promise<WorkflowResponseDto> {
    return this.workflowsService.update(id, updateWorkflowDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete workflow',
    description: `
      Soft deletes a workflow. Only the workflow owner can delete it.
      
      **Deletion Behavior:**
      - Soft delete (data preserved in database)
      - Workflow becomes inaccessible immediately
      - Trigger URL stops working
      - Cannot be restored through API (requires database intervention)
      - Cached data is invalidated
      
      **Use Cases:**
      - Remove unused workflows
      - Disable webhook triggers permanently
      - Clean up test workflows
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'Workflow UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 204,
    description: 'Workflow deleted successfully (no content)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not the workflow owner' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User): Promise<void> {
    return this.workflowsService.remove(id, user.id);
  }

  @Get(':id/runs')
  @ApiOperation({
    summary: 'Get workflow run history',
    description: `
      Retrieve paginated list of all runs for a specific workflow.
      Can be filtered by run status.
      
      **Filters:**
      - status: Filter by run status (running, success, failed, skipped)
      
      **Pagination:**
      - page: Page number (default: 1)
      - limit: Items per page (default: 20, max: 100)
    `,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Workflow UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
    example: 20,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: WorkflowRunStatus,
    description: 'Filter by run status',
    example: WorkflowRunStatus.SUCCESS,
  })
  @ApiResponse({
    status: 200,
    description: 'List of workflow runs',
    type: PaginatedRunResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow not found',
  })
  async getWorkflowRuns(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status', new ParseEnumPipe(WorkflowRunStatus, { optional: true }))
    status?: WorkflowRunStatus,
  ): Promise<PaginatedRunResponseDto> {
    const pageSize = Math.min(limit, 100);
    return this.runsService.getWorkflowRuns(id, user.id, page, pageSize, status);
  }
}
