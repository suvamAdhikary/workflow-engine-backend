import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { ApiProperty, ApiHideProperty } from '@nestjs/swagger';

import { Workflow } from './workflow.entity';
import { ApiKey } from './api-key.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
@Index(['createdAt'])
export class User {
  @ApiProperty({
    description: 'Unique identifier for the user',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @Column({ unique: true, length: 255 })
  email: string;

  @ApiHideProperty()
  @Column({ name: 'password_hash', length: 255 })
  @Exclude()
  passwordHash: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @Column({ name: 'first_name', length: 100, nullable: true })
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @Column({ name: 'last_name', length: 100, nullable: true })
  lastName?: string;

  @ApiProperty({
    description: 'User roles',
    enum: UserRole,
    isArray: true,
    example: [UserRole.USER],
  })
  @Column('text', { array: true, default: [UserRole.USER] })
  roles: UserRole[];

  @ApiProperty({
    description: 'Whether the user email is verified',
    example: true,
  })
  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Last login timestamp',
    example: '2024-01-15T10:30:00Z',
    required: false,
  })
  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @ApiProperty({
    description: 'User creation timestamp',
    example: '2024-01-01T00:00:00Z',
  })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({
    description: 'User last update timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relationships
  @OneToMany(() => Workflow, (workflow) => workflow.user)
  workflows: Workflow[];

  @OneToMany(() => ApiKey, (apiKey) => apiKey.user)
  apiKeys: ApiKey[];

  // Virtual properties
  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
  })
  get fullName(): string {
    if (this.firstName && this.lastName) {
      return `${this.firstName} ${this.lastName}`;
    }
    return this.firstName || this.lastName || this.email;
  }

  @ApiProperty({
    description: 'Whether the user has admin role',
    example: false,
  })
  get isAdmin(): boolean {
    return this.roles?.includes(UserRole.ADMIN) || false;
  }

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}