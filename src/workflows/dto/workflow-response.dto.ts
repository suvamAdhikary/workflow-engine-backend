import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class WorkflowResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'Workflow UUID' })
  @Expose()
  id: string;

  @ApiProperty({ example: 'User Signup Notification', description: 'Workflow name' })
  @Expose()
  name: string;

  @ApiProperty({
    example: 'Sends a Slack notification when a user signs up',
    description: 'Workflow description',
  })
  @Expose()
  description?: string;

  @ApiProperty({ example: true, description: 'Whether the workflow is enabled' })
  @Expose()
  enabled: boolean;

  @ApiProperty({
    description: 'HTTP trigger configuration with unique path',
    example: {
      type: 'http',
      path: '/t/4f1f9a2c9b7f4f2a9b2e2f7d4a3c1b0e',
    },
  })
  @Expose()
  trigger: {
    type: string;
    path: string;
  };

  @ApiProperty({
    description: 'Array of workflow steps',
    type: 'array',
    example: [
      {
        type: 'filter',
        conditions: [{ path: 'event_type', op: 'eq', value: 'user.signup' }],
      },
    ],
  })
  @Expose()
  steps: any[];

  @ApiProperty({ example: '2024-01-20T10:30:00.000Z', description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ example: '2024-01-20T15:45:00.000Z', description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({
    example: 'https://api.example.com/t/4f1f9a2c9b7f4f2a9b2e2f7d4a3c1b0e',
    description: 'Full trigger URL for webhook',
  })
  @Expose()
  triggerUrl?: string;

  constructor(partial: Partial<WorkflowResponseDto>) {
    Object.assign(this, partial);
  }
}

@Exclude()
export class PaginatedWorkflowResponseDto {
  @ApiProperty({ type: [WorkflowResponseDto], description: 'Array of workflows' })
  @Expose()
  @Type(() => WorkflowResponseDto)
  data: WorkflowResponseDto[];

  @ApiProperty({ example: 50, description: 'Total count of workflows' })
  @Expose()
  total: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  @Expose()
  page: number;

  @ApiProperty({ example: 20, description: 'Items per page' })
  @Expose()
  limit: number;

  @ApiProperty({ example: 3, description: 'Total number of pages' })
  @Expose()
  totalPages: number;

  constructor(partial: Partial<PaginatedWorkflowResponseDto>) {
    Object.assign(this, partial);
  }
}
