import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Workflow } from '../shared/entities/workflow.entity';
import { CreateWorkflowDto, UpdateWorkflowDto, WorkflowResponseDto, PaginatedWorkflowResponseDto } from './dto';
import { CacheService } from '../shared/cache/cache.service';
import { LoggingService } from '../shared/logging/logging.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WorkflowsService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'workflow';

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    private readonly cacheService: CacheService,
    private readonly loggingService: LoggingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a unique trigger path for webhook
   * Returns just the random hex string (32 chars)
   */
  private generateTriggerPath(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Build full trigger URL
   */
  private buildTriggerUrl(path: string): string {
    const baseUrl = this.configService.get<string>('app.url', 'http://localhost:3000');
    return `${baseUrl}/t/${path}`;
  }

  /**
   * Transform workflow entity to response DTO
   */
  private toResponseDto(workflow: Workflow): WorkflowResponseDto {
    return new WorkflowResponseDto({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      enabled: workflow.enabled,
      trigger: workflow.trigger,
      steps: workflow.steps,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      triggerUrl: this.buildTriggerUrl(workflow.triggerPath),
    });
  }

  /**
   * Validate workflow structure
   */
  private validateWorkflowStructure(dto: CreateWorkflowDto | UpdateWorkflowDto): void {
    // Validate trigger
    if (dto.trigger && dto.trigger.type !== 'http') {
      throw new BadRequestException('Only HTTP trigger type is supported');
    }

    // Validate steps
    if (dto.steps) {
      if (dto.steps.length === 0) {
        throw new BadRequestException('Workflow must have at least one step');
      }

      dto.steps.forEach((step, index) => {
        if (!['filter', 'transform', 'http_request'].includes(step.type)) {
          throw new BadRequestException(
            `Invalid step type "${step.type}" at index ${index}. Must be one of: filter, transform, http_request`,
          );
        }

        // Validate filter step
        if (step.type === 'filter') {
          const filterStep = step as any;
          if (!filterStep.conditions || filterStep.conditions.length === 0) {
            throw new BadRequestException(`Filter step at index ${index} must have at least one condition`);
          }
          filterStep.conditions.forEach((condition: any, condIndex: number) => {
            if (!condition.path || !condition.op) {
              throw new BadRequestException(
                `Filter condition at index ${condIndex} in step ${index} must have path and op`,
              );
            }
            if (!['eq', 'neq'].includes(condition.op)) {
              throw new BadRequestException(
                `Invalid operator "${condition.op}" in filter step at index ${index}. Must be eq or neq`,
              );
            }
          });
        }

        // Validate transform step
        if (step.type === 'transform') {
          const transformStep = step as any;
          if (!transformStep.ops || transformStep.ops.length === 0) {
            throw new BadRequestException(`Transform step at index ${index} must have at least one operation`);
          }
          transformStep.ops.forEach((op: any, opIndex: number) => {
            if (!['template', 'default', 'pick'].includes(op.op)) {
              throw new BadRequestException(
                `Invalid operation "${op.op}" at index ${opIndex} in transform step ${index}. Must be template, default, or pick`,
              );
            }
            if (op.op === 'template' && (!op.to || !op.template)) {
              throw new BadRequestException(
                `Template operation at index ${opIndex} in step ${index} must have 'to' and 'template' fields`,
              );
            }
            if (op.op === 'default' && (!op.path || op.value === undefined)) {
              throw new BadRequestException(
                `Default operation at index ${opIndex} in step ${index} must have 'path' and 'value' fields`,
              );
            }
            if (op.op === 'pick' && (!op.paths || op.paths.length === 0)) {
              throw new BadRequestException(
                `Pick operation at index ${opIndex} in step ${index} must have 'paths' array`,
              );
            }
          });
        }

        // Validate http_request step
        if (step.type === 'http_request') {
          const httpStep = step as any;
          if (!httpStep.method || !httpStep.url || !httpStep.body) {
            throw new BadRequestException(
              `HTTP request step at index ${index} must have method, url, and body`,
            );
          }
          if (!['GET', 'POST'].includes(httpStep.method)) {
            throw new BadRequestException(
              `Invalid HTTP method "${httpStep.method}" in step ${index}. Must be GET or POST`,
            );
          }
          if (!httpStep.body.mode || !['ctx', 'custom'].includes(httpStep.body.mode)) {
            throw new BadRequestException(
              `HTTP request body mode in step ${index} must be 'ctx' or 'custom'`,
            );
          }
          if (httpStep.body.mode === 'custom' && !httpStep.body.value) {
            throw new BadRequestException(
              `HTTP request step at index ${index} with custom body mode must have 'value' field`,
            );
          }
        }
      });
    }
  }

  /**
   * Create a new workflow
   */
  async create(createWorkflowDto: CreateWorkflowDto, userId: string): Promise<WorkflowResponseDto> {
    this.loggingService.info('Creating new workflow', 'WorkflowsService', {
      userId,
      workflowName: createWorkflowDto.name,
    });

    try {
      // Validate workflow structure
      this.validateWorkflowStructure(createWorkflowDto);

      // Generate unique trigger path
      const triggerPath = this.generateTriggerPath();

      // Check if path already exists (extremely unlikely but safe)
      const existingWorkflow = await this.workflowRepository.findOne({
        where: { triggerPath } as any,
      });

      if (existingWorkflow) {
        throw new ConflictException('Failed to generate unique trigger path. Please try again.');
      }

      // Create workflow with trigger path
      const workflow = this.workflowRepository.create({
        name: createWorkflowDto.name,
        description: createWorkflowDto.description,
        enabled: createWorkflowDto.enabled ?? true,
        userId,
        triggerPath,
        trigger: {
          type: 'http',
          path: `/t/${triggerPath}`,
        },
        steps: createWorkflowDto.steps as any[],
        tags: [],
        version: 1,
      });

      const savedWorkflow = await this.workflowRepository.save(workflow);

      this.loggingService.info('Workflow created successfully', 'WorkflowsService', {
        workflowId: savedWorkflow.id,
        userId,
        triggerPath,
      });

      // Invalidate user's workflow list cache
      await this.cacheService.del(`${this.CACHE_PREFIX}:list:${userId}`);

      return this.toResponseDto(savedWorkflow);
    } catch (error) {
      this.loggingService.error('Failed to create workflow', error.stack, 'WorkflowsService', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all workflows for a user with pagination
   */
  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 20,
    enabled?: boolean,
  ): Promise<PaginatedWorkflowResponseDto> {
    this.loggingService.debug('Fetching workflows', 'WorkflowsService', {
      userId,
      page,
      limit,
      enabled,
    });

    try {
      // Build cache key
      const cacheKey = `${this.CACHE_PREFIX}:list:${userId}:${page}:${limit}:${enabled ?? 'all'}`;

      // Try to get from cache
      const cached = await this.cacheService.get<PaginatedWorkflowResponseDto>(cacheKey);
      if (cached) {
        this.loggingService.debug('Returning workflows from cache', 'WorkflowsService', { userId, cacheKey });
        return cached;
      }

      // Build query
      const queryBuilder = this.workflowRepository
        .createQueryBuilder('workflow')
        .where('workflow.userId = :userId', { userId })
        .andWhere('workflow.deletedAt IS NULL');

      if (enabled !== undefined) {
        queryBuilder.andWhere('workflow.enabled = :enabled', { enabled });
      }

      // Get total count
      const total = await queryBuilder.getCount();

      // Get paginated results
      const workflows = await queryBuilder
        .orderBy('workflow.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany();

      const result = new PaginatedWorkflowResponseDto({
        data: workflows.map((workflow) => this.toResponseDto(workflow)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });

      // Cache the result
      await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

      this.loggingService.debug('Workflows fetched successfully', 'WorkflowsService', {
        userId,
        count: workflows.length,
        total,
      });

      return result;
    } catch (error) {
      this.loggingService.error('Failed to fetch workflows', error.stack, 'WorkflowsService', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get a single workflow by ID
   */
  async findOne(id: string, userId: string): Promise<WorkflowResponseDto> {
    this.loggingService.debug('Fetching workflow', 'WorkflowsService', { workflowId: id, userId });

    try {
      // Try to get from cache
      const cacheKey = `${this.CACHE_PREFIX}:${id}`;
      const cached = await this.cacheService.get<Workflow>(cacheKey);

      let workflow: Workflow | null = null;

      if (cached) {
        workflow = cached;
        this.loggingService.debug('Returning workflow from cache', 'WorkflowsService', { workflowId: id });
      } else {
        workflow = await this.workflowRepository.findOne({
          where: { id, deletedAt: null as any } as any,
        });

        if (!workflow) {
          throw new NotFoundException(`Workflow with ID ${id} not found`);
        }

        // Cache the workflow
        await this.cacheService.set(cacheKey, workflow, this.CACHE_TTL);
      }

      // Check ownership
      if (workflow.userId !== userId) {
        throw new ForbiddenException('You do not have permission to access this workflow');
      }

      return this.toResponseDto(workflow);
    } catch (error) {
      this.loggingService.error('Failed to fetch workflow', undefined, 'WorkflowsService', {
        workflowId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update a workflow
   */
  async update(id: string, updateWorkflowDto: UpdateWorkflowDto, userId: string): Promise<WorkflowResponseDto> {
    this.loggingService.info('Updating workflow', 'WorkflowsService', { workflowId: id, userId });

    try {
      // Find existing workflow
      const workflow = await this.workflowRepository.findOne({
        where: { id, deletedAt: null as any } as any,
      });

      if (!workflow) {
        throw new NotFoundException(`Workflow with ID ${id} not found`);
      }

      // Check ownership
      if (workflow.userId !== userId) {
        throw new ForbiddenException('You do not have permission to update this workflow');
      }

      // Validate if structure fields are being updated
      if (updateWorkflowDto.steps || updateWorkflowDto.trigger) {
        this.validateWorkflowStructure(updateWorkflowDto);
      }

      // Note: We don't allow changing trigger path to maintain unique URLs
      // Update workflow fields
      if (updateWorkflowDto.name !== undefined) {
        workflow.name = updateWorkflowDto.name;
      }
      if (updateWorkflowDto.description !== undefined) {
        workflow.description = updateWorkflowDto.description;
      }
      if (updateWorkflowDto.enabled !== undefined) {
        workflow.enabled = updateWorkflowDto.enabled;
      }
      if (updateWorkflowDto.steps !== undefined) {
        workflow.steps = updateWorkflowDto.steps as any[];
      }

      const updatedWorkflow = await this.workflowRepository.save(workflow);

      this.loggingService.info('Workflow updated successfully', 'WorkflowsService', {
        workflowId: id,
        userId,
      });

      // Invalidate caches
      await Promise.all([
        this.cacheService.del(`${this.CACHE_PREFIX}:${id}`),
        this.cacheService.del(`${this.CACHE_PREFIX}:list:${userId}`),
      ]);

      return this.toResponseDto(updatedWorkflow);
    } catch (error) {
      this.loggingService.error('Failed to update workflow', error.stack, 'WorkflowsService', {
        workflowId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete a workflow (soft delete)
   */
  async remove(id: string, userId: string): Promise<void> {
    this.loggingService.info('Deleting workflow', 'WorkflowsService', { workflowId: id, userId });

    try {
      // Find existing workflow
      const workflow = await this.workflowRepository.findOne({
        where: { id, deletedAt: null as any } as any,
      });

      if (!workflow) {
        throw new NotFoundException(`Workflow with ID ${id} not found`);
      }

      // Check ownership
      if (workflow.userId !== userId) {
        throw new ForbiddenException('You do not have permission to delete this workflow');
      }

      // Soft delete
      workflow.deletedAt = new Date();
      await this.workflowRepository.save(workflow);

      this.loggingService.info('Workflow deleted successfully', 'WorkflowsService', {
        workflowId: id,
        userId,
      });

      // Invalidate caches
      await Promise.all([
        this.cacheService.del(`${this.CACHE_PREFIX}:${id}`),
        this.cacheService.del(`${this.CACHE_PREFIX}:list:${userId}`),
      ]);
    } catch (error) {
      this.loggingService.error('Failed to delete workflow', error.stack, 'WorkflowsService', {
        workflowId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Find workflow by trigger path (for webhook execution)
   */
  async findByTriggerPath(path: string): Promise<Workflow | null> {
    this.loggingService.debug('Finding workflow by trigger path', 'WorkflowsService', { path });

    try {
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}:trigger:${path}`;
      const cached = await this.cacheService.get<Workflow>(cacheKey);

      if (cached) {
        return cached;
      }

      // Query database
      const workflow = await this.workflowRepository.findOne({
        where: {
          triggerPath: path,
          deletedAt: null as any,
        } as any,
      });

      if (workflow) {
        // Cache the workflow
        await this.cacheService.set(cacheKey, workflow, this.CACHE_TTL);
      }

      return workflow;
    } catch (error) {
      this.loggingService.error('Failed to find workflow by trigger path', undefined, 'WorkflowsService', {
        path,
        error: error.message,
      });
      return null;
    }
  }
}
