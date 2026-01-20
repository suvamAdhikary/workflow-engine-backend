import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RunsService } from './runs.service';
import { RunResponseDto, PaginatedRunResponseDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../shared/entities/user.entity';
import { WorkflowRunStatus } from '../shared/entities/workflow-run.entity';

@ApiTags('Workflow Runs')
@Controller('runs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all workflow runs',
    description: `
      Retrieve paginated list of all workflow runs for the authenticated user.
      Can be filtered by status and workflow ID.
      
      **Filters:**
      - status: Filter by run status (running, success, failed, skipped)
      - workflowId: Filter by specific workflow
      
      **Pagination:**
      - page: Page number (default: 1)
      - limit: Items per page (default: 20, max: 100)
    `,
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
  @ApiQuery({
    name: 'workflowId',
    required: false,
    type: String,
    description: 'Filter by workflow ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'List of workflow runs',
    type: PaginatedRunResponseDto,
  })
  async getAllRuns(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status', new ParseEnumPipe(WorkflowRunStatus, { optional: true }))
    status?: WorkflowRunStatus,
    @Query('workflowId', new ParseUUIDPipe({ optional: true })) workflowId?: string,
  ): Promise<PaginatedRunResponseDto> {
    // Limit max page size
    const pageSize = Math.min(limit, 100);
    return this.runsService.getAllRuns(user.id, page, pageSize, status, workflowId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get workflow run details',
    description: `
      Retrieve detailed information about a specific workflow run.
      Includes input/output context, error details, and workflow information.
    `,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Run UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow run details',
    type: RunResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied',
  })
  async getRunById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<RunResponseDto> {
    return this.runsService.getRunById(id, user.id);
  }
}
