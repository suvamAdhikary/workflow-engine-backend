import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import { Workflow } from './workflow.entity';

export enum WorkflowRunStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export interface WorkflowRunErrorDetails {
  step?: number;
  stepType?: string;
  message: string;
  stack?: string;
  code?: string;
}

@Entity('workflow_runs')
@Index(['workflowId', 'status'])
@Index(['startedAt'])
@Index(['status', 'startedAt'])
@Index(['durationMs'], { where: 'duration_ms IS NOT NULL' })
export class WorkflowRun {
  @ApiProperty({
    description: 'Unique identifier for the workflow run',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'ID of the workflow that was executed',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Column({ name: 'workflow_id', type: 'uuid' })
  @Index()
  workflowId: string;

  @ApiProperty({
    description: 'ID of the user who owns the workflow',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ApiProperty({
    description: 'Execution status of the workflow run',
    enum: WorkflowRunStatus,
    example: WorkflowRunStatus.SUCCESS,
  })
  @Column({
    type: 'enum',
    enum: WorkflowRunStatus,
  })
  @Index()
  status: WorkflowRunStatus;

  @ApiProperty({
    description: 'Input context data that triggered the workflow',
    example: {
      event_type: 'user_signup',
      user_id: '12345',
      email: 'user@example.com'
    },
    required: false,
  })
  @Column({ name: 'input_context', type: 'jsonb', nullable: true })
  inputContext?: any;

  @ApiProperty({
    description: 'Final output context after all steps executed',
    example: {
      event_type: 'user_signup',
      user_id: '12345',
      email: 'user@example.com',
      welcome_message: 'Welcome user@example.com!'
    },
    required: false,
  })
  @Column({ name: 'output_context', type: 'jsonb', nullable: true })
  outputContext?: any;

  @ApiProperty({
    description: 'Error details if the workflow run failed',
    example: {
      step: 2,
      stepType: 'http_request',
      message: 'Request timeout',
      code: 'TIMEOUT_ERROR'
    },
    required: false,
  })
  @Column({ name: 'error_details', type: 'jsonb', nullable: true })
  errorDetails?: WorkflowRunErrorDetails;

  @ApiProperty({
    description: 'Total number of steps in the workflow',
    example: 3,
  })
  @Column({ name: 'step_count', default: 0 })
  stepCount: number;

  @ApiProperty({
    description: 'Current step being executed (0-based)',
    example: 2,
  })
  @Column({ name: 'current_step', default: 0 })
  currentStep: number;

  @ApiProperty({
    description: 'Timestamp when the workflow run started',
    example: '2024-01-15T10:30:00Z',
  })
  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @ApiProperty({
    description: 'Timestamp when the workflow run completed',
    example: '2024-01-15T10:30:05Z',
    required: false,
  })
  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @ApiProperty({
    description: 'Duration of the workflow run in milliseconds',
    example: 5000,
    required: false,
  })
  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs?: number;

  // Relationships
  @ManyToOne(() => Workflow, (workflow) => workflow.runs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_id' })
  workflow: Workflow;

  // Virtual properties
  @ApiProperty({
    description: 'Whether the workflow run is currently running',
    example: false,
  })
  get isRunning(): boolean {
    return this.status === WorkflowRunStatus.RUNNING;
  }

  @ApiProperty({
    description: 'Whether the workflow run completed successfully',
    example: true,
  })
  get isSuccess(): boolean {
    return this.status === WorkflowRunStatus.SUCCESS;
  }

  @ApiProperty({
    description: 'Whether the workflow run failed',
    example: false,
  })
  get isFailed(): boolean {
    return this.status === WorkflowRunStatus.FAILED;
  }

  @ApiProperty({
    description: 'Whether the workflow run was skipped',
    example: false,
  })
  get isSkipped(): boolean {
    return this.status === WorkflowRunStatus.SKIPPED;
  }

  @ApiProperty({
    description: 'Progress percentage (0-100)',
    example: 100,
  })
  get progressPercentage(): number {
    if (this.stepCount === 0) return 0;
    return Math.round((this.currentStep / this.stepCount) * 100);
  }

  @ApiProperty({
    description: 'Human-readable duration',
    example: '5.0s',
  })
  get durationFormatted(): string {
    if (!this.durationMs) return 'N/A';
    
    if (this.durationMs < 1000) {
      return `${this.durationMs}ms`;
    } else if (this.durationMs < 60000) {
      return `${(this.durationMs / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(this.durationMs / 60000);
      const seconds = ((this.durationMs % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  }

  constructor(partial: Partial<WorkflowRun>) {
    Object.assign(this, partial);
  }
}