import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import { User } from './user.entity';
import { WorkflowRun } from './workflow-run.entity';

export interface HttpTrigger {
  type: 'http';
  path: string;
}

export interface FilterCondition {
  path: string;
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'nin' | 'exists';
  value?: any;
}

export interface FilterStep {
  type: 'filter';
  conditions: FilterCondition[];
}

export interface TransformOperation {
  op: 'template' | 'default' | 'pick' | 'omit' | 'rename';
  path?: string;
  to?: string;
  from?: string;
  template?: string;
  value?: any;
  paths?: string[];
}

export interface TransformStep {
  type: 'transform';
  ops: TransformOperation[];
}

export interface HttpRequestStep {
  type: 'http_request';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: {
    mode: 'ctx' | 'custom';
    value?: any;
  };
  timeoutMs?: number;
  retries?: number;
}

export type WorkflowStep = FilterStep | TransformStep | HttpRequestStep;

@Entity('workflows')
@Index(['userId', 'enabled'])
@Index(['triggerPath', 'enabled'])
@Index(['userId', 'createdAt'])
@Index(['tags'], { where: 'array_length(tags, 1) > 0' })
export class Workflow {
  @ApiProperty({
    description: 'Unique identifier for the workflow',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'ID of the user who owns this workflow',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ApiProperty({
    description: 'Workflow name',
    example: 'Slack Notification Workflow',
  })
  @Column({ length: 255 })
  name: string;

  @ApiProperty({
    description: 'Workflow description',
    example: 'Sends notifications to Slack when certain conditions are met',
    required: false,
  })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty({
    description: 'Whether the workflow is enabled',
    example: true,
  })
  @Column({ default: true })
  @Index()
  enabled: boolean;

  @ApiProperty({
    description: 'Workflow trigger configuration',
    example: {
      type: 'http',
      path: '/t/4f1f9a2c9b7f4f2a9b2e2f7d4a3c1b0e'
    },
  })
  @Column({ type: 'jsonb' })
  trigger: HttpTrigger;

  @ApiProperty({
    description: 'Array of workflow steps to execute',
    example: [
      {
        type: 'filter',
        conditions: [
          { path: 'event_type', op: 'eq', value: 'alert' }
        ]
      },
      {
        type: 'transform',
        ops: [
          { op: 'template', to: 'message', template: 'Alert: {{event_type}}' }
        ]
      },
      {
        type: 'http_request',
        method: 'POST',
        url: 'https://hooks.slack.com/services/...',
        body: { mode: 'custom', value: { text: '{{message}}' } }
      }
    ],
  })
  @Column({ type: 'jsonb' })
  steps: WorkflowStep[];

  @ApiProperty({
    description: 'Unique trigger path for webhook execution',
    example: '4f1f9a2c9b7f4f2a9b2e2f7d4a3c1b0e',
  })
  @Column({ name: 'trigger_path', length: 32, unique: true })
  @Index()
  triggerPath: string;

  @ApiProperty({
    description: 'Workflow version number',
    example: 1,
  })
  @Column({ default: 1 })
  version: number;

  @ApiProperty({
    description: 'Workflow tags for categorization',
    example: ['notifications', 'slack', 'alerts'],
    required: false,
  })
  @Column('text', { array: true, default: [] })
  tags: string[];

  @ApiProperty({
    description: 'Workflow creation timestamp',
    example: '2024-01-01T00:00:00Z',
  })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({
    description: 'Workflow last update timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ApiProperty({
    description: 'Workflow soft delete timestamp',
    example: null,
    required: false,
  })
  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.workflows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => WorkflowRun, (run) => run.workflow)
  runs: WorkflowRun[];

  // Virtual properties
  @ApiProperty({
    description: 'Complete webhook trigger URL',
    example: 'https://api.workflow-engine.com/t/4f1f9a2c9b7f4f2a9b2e2f7d4a3c1b0e',
  })
  get triggerUrl(): string {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/t/${this.triggerPath}`;
  }

  @ApiProperty({
    description: 'Number of steps in the workflow',
    example: 3,
  })
  get stepCount(): number {
    return this.steps?.length || 0;
  }

  @ApiProperty({
    description: 'Whether the workflow has any filter steps',
    example: true,
  })
  get hasFilterSteps(): boolean {
    return this.steps?.some(step => step.type === 'filter') || false;
  }

  @ApiProperty({
    description: 'Whether the workflow has any transform steps',
    example: true,
  })
  get hasTransformSteps(): boolean {
    return this.steps?.some(step => step.type === 'transform') || false;
  }

  @ApiProperty({
    description: 'Whether the workflow has any HTTP request steps',
    example: true,
  })
  get hasHttpRequestSteps(): boolean {
    return this.steps?.some(step => step.type === 'http_request') || false;
  }

  constructor(partial: Partial<Workflow>) {
    Object.assign(this, partial);
  }
}