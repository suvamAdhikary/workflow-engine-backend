import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Import all entities
import { User } from '../entities/user.entity';
import { Workflow } from '../entities/workflow.entity';
import { WorkflowRun } from '../entities/workflow-run.entity';
import { ApiKey } from '../entities/api-key.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Workflow,
      WorkflowRun,
      ApiKey,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}