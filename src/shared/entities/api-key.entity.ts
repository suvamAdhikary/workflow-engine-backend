import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { ApiProperty, ApiHideProperty } from '@nestjs/swagger';

import { User } from './user.entity';

export enum ApiKeyScope {
  WORKFLOWS_READ = 'workflows:read',
  WORKFLOWS_WRITE = 'workflows:write',
  RUNS_READ = 'runs:read',
  ADMIN = 'admin',
}

@Entity('api_keys')
@Index(['userId', 'active'])
@Index(['keyPrefix'])
@Index(['expiresAt'], { where: 'expires_at IS NOT NULL' })
export class ApiKey {
  @ApiProperty({
    description: 'Unique identifier for the API key',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'ID of the user who owns this API key',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ApiProperty({
    description: 'Human-readable name for the API key',
    example: 'Production Integration Key',
  })
  @Column({ length: 100 })
  name: string;

  @ApiHideProperty()
  @Column({ name: 'key_hash', length: 255 })
  @Exclude()
  keyHash: string;

  @ApiProperty({
    description: 'First 8 characters of the API key for identification',
    example: 'wf_12345',
  })
  @Column({ name: 'key_prefix', length: 8 })
  keyPrefix: string;

  @ApiProperty({
    description: 'Scopes/permissions granted to this API key',
    enum: ApiKeyScope,
    isArray: true,
    example: [ApiKeyScope.WORKFLOWS_READ, ApiKeyScope.WORKFLOWS_WRITE],
  })
  @Column('text', { 
    array: true, 
    default: [ApiKeyScope.WORKFLOWS_READ, ApiKeyScope.WORKFLOWS_WRITE] 
  })
  scopes: ApiKeyScope[];

  @ApiProperty({
    description: 'Whether the API key is active',
    example: true,
  })
  @Column({ default: true })
  @Index()
  active: boolean;

  @ApiProperty({
    description: 'API key expiration timestamp',
    example: '2024-12-31T23:59:59Z',
    required: false,
  })
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @ApiProperty({
    description: 'Last time this API key was used',
    example: '2024-01-15T10:30:00Z',
    required: false,
  })
  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  @ApiProperty({
    description: 'API key creation timestamp',
    example: '2024-01-01T00:00:00Z',
  })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.apiKeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Virtual properties
  @ApiProperty({
    description: 'Whether the API key is expired',
    example: false,
  })
  get isExpired(): boolean {
    return this.expiresAt ? new Date() > this.expiresAt : false;
  }

  @ApiProperty({
    description: 'Whether the API key is valid (active and not expired)',
    example: true,
  })
  get isValid(): boolean {
    return this.active && !this.isExpired;
  }

  @ApiProperty({
    description: 'Days until expiration',
    example: 30,
    required: false,
  })
  get daysUntilExpiration(): number | null {
    if (!this.expiresAt) return null;
    const now = new Date();
    const diffTime = this.expiresAt.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  @ApiProperty({
    description: 'Whether the API key has admin scope',
    example: false,
  })
  get hasAdminScope(): boolean {
    return this.scopes.includes(ApiKeyScope.ADMIN);
  }

  @ApiProperty({
    description: 'Whether the API key can read workflows',
    example: true,
  })
  get canReadWorkflows(): boolean {
    return this.scopes.includes(ApiKeyScope.WORKFLOWS_READ) || this.hasAdminScope;
  }

  @ApiProperty({
    description: 'Whether the API key can write workflows',
    example: true,
  })
  get canWriteWorkflows(): boolean {
    return this.scopes.includes(ApiKeyScope.WORKFLOWS_WRITE) || this.hasAdminScope;
  }

  @ApiProperty({
    description: 'Whether the API key can read runs',
    example: true,
  })
  get canReadRuns(): boolean {
    return this.scopes.includes(ApiKeyScope.RUNS_READ) || this.hasAdminScope;
  }

  constructor(partial: Partial<ApiKey>) {
    Object.assign(this, partial);
  }
}