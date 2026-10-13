import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  WorkflowRunStatus,
  WorkflowRunErrorDetails,
} from '../../shared/entities/workflow-run.entity';
import { WorkflowResponseDto } from '../../workflows/dto/workflow-response.dto';

@Exclude()
export class RunResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'Run UUID' })
  @Expose()
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'Workflow UUID' })
  @Expose()
  workflowId: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'User UUID' })
  @Expose()
  userId: string;

  @ApiProperty({
    enum: WorkflowRunStatus,
    example: WorkflowRunStatus.SUCCESS,
    description: 'Execution status',
  })
  @Expose()
  status: WorkflowRunStatus;

  @ApiProperty({
    example: { event_type: 'user.signup', user: { email: 'test@example.com' } },
    description: 'Input context data',
    required: false,
  })
  @Expose()
  inputContext?: any;

  @ApiProperty({
    example: {
      event_type: 'user.signup',
      user: { email: 'test@example.com' },
      message: 'Welcome!',
    },
    description: 'Output context data',
    required: false,
  })
  @Expose()
  outputContext?: any;

  @ApiProperty({
    example: {
      step: 2,
      stepType: 'http_request',
      message: 'Request timeout',
      code: 'TIMEOUT_ERROR',
    },
    description: 'Error details if failed',
    required: false,
  })
  @Expose()
  errorDetails?: WorkflowRunErrorDetails;

  @ApiProperty({ example: 3, description: 'Total number of steps' })
  @Expose()
  stepCount: number;

  @ApiProperty({ example: 2, description: 'Current step index (0-based)' })
  @Expose()
  currentStep: number;

  @ApiProperty({ example: '2024-01-20T10:30:00.000Z', description: 'Start timestamp' })
  @Expose()
  startedAt: Date;

  @ApiProperty({
    example: '2024-01-20T10:30:05.000Z',
    description: 'Completion timestamp',
    required: false,
  })
  @Expose()
  completedAt?: Date;

  @ApiProperty({ example: 5000, description: 'Duration in milliseconds', required: false })
  @Expose()
  durationMs?: number;

  @ApiProperty({ type: WorkflowResponseDto, description: 'Workflow details', required: false })
  @Expose()
  @Type(() => WorkflowResponseDto)
  workflow?: WorkflowResponseDto;

  constructor(partial: Partial<RunResponseDto>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class PaginatedRunResponseDto {
  @ApiProperty({ type: [RunResponseDto], description: 'Array of workflow runs' })
  @Expose()
  @Type(() => RunResponseDto)
  data: RunResponseDto[];

  @ApiProperty({ example: 100, description: 'Total count of runs' })
  @Expose()
  total: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  @Expose()
  page: number;

  @ApiProperty({ example: 20, description: 'Items per page' })
  @Expose()
  limit: number;

  @ApiProperty({ example: 5, description: 'Total number of pages' })
  @Expose()
  totalPages: number;

  constructor(partial: Partial<PaginatedRunResponseDto>) {
    Object.assign(this, partial);
  }
}
