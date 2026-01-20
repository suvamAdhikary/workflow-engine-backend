import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowRun, WorkflowRunStatus } from '../shared/entities/workflow-run.entity';
import { Workflow } from '../shared/entities/workflow.entity';
import { RunResponseDto, PaginatedRunResponseDto } from './dto';
import { CacheService } from '../shared/cache/cache.service';
import { LoggingService } from '../shared/logging/logging.service';
import { WorkflowResponseDto } from '../workflows/dto/workflow-response.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RunsService {
  private readonly CACHE_TTL = 60; // 1 minute for run history
  private readonly CACHE_PREFIX = 'runs';

  constructor(
    @InjectRepository(WorkflowRun)
    private readonly runRepository: Repository<WorkflowRun>,
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    private readonly cacheService: CacheService,
    private readonly loggingService: LoggingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Transform run entity to response DTO
   */
  private toResponseDto(run: WorkflowRun, includeWorkflow = false): RunResponseDto {
    const dto = new RunResponseDto({
      id: run.id,
      workflowId: run.workflowId,
      userId: run.userId,
      status: run.status,
      inputContext: run.inputContext,
      outputContext: run.outputContext,
      errorDetails: run.errorDetails,
      stepCount: run.stepCount,
      currentStep: run.currentStep,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
    });

    if (includeWorkflow && run.workflow) {
      const baseUrl = this.configService.get<string>('app.url', 'http://localhost:3000');
      dto.workflow = new WorkflowResponseDto({
        id: run.workflow.id,
        name: run.workflow.name,
        description: run.workflow.description,
        enabled: run.workflow.enabled,
        trigger: run.workflow.trigger,
        steps: run.workflow.steps,
        createdAt: run.workflow.createdAt,
        updatedAt: run.workflow.updatedAt,
        triggerUrl: `${baseUrl}/t/${run.workflow.triggerPath}`,
      });
    }

    return dto;
  }

  /**
   * Get runs for a specific workflow
   */
  async getWorkflowRuns(
    workflowId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: WorkflowRunStatus,
  ): Promise<PaginatedRunResponseDto> {
    this.loggingService.info(
      `getWorkflowRuns - Started: workflowId=${workflowId}, userId=${userId}, page=${page}, limit=${limit}, status=${status}`,
      'RunsService',
    );

    // Verify workflow exists and belongs to user
    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId, userId },
    });

    if (!workflow) {
      this.loggingService.warn(
        `getWorkflowRuns - Workflow not found: workflowId=${workflowId}, userId=${userId}`,
        'RunsService',
      );
      throw new NotFoundException(`Workflow with ID ${workflowId} not found`);
    }

    // Build cache key
    const cacheKey = `${this.CACHE_PREFIX}:workflow:${workflowId}:page:${page}:limit:${limit}:status:${status || 'all'}`;

    // Try cache first
    const cached = await this.cacheService.get<PaginatedRunResponseDto>(cacheKey);
    if (cached) {
      this.loggingService.debug(
        `getWorkflowRuns - Cache hit: workflowId=${workflowId}`,
        'RunsService',
      );
      return cached;
    }

    // Build query
    const queryBuilder = this.runRepository
      .createQueryBuilder('run')
      .where('run.workflowId = :workflowId', { workflowId })
      .orderBy('run.startedAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('run.status = :status', { status });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const skip = (page - 1) * limit;
    const runs = await queryBuilder.skip(skip).take(limit).getMany();

    // Transform to DTOs
    const data = runs.map((run) => this.toResponseDto(run, false));

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    const result = new PaginatedRunResponseDto({
      data,
      total,
      page,
      limit,
      totalPages,
    });

    // Cache result
    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    this.loggingService.info(
      `getWorkflowRuns - Completed: workflowId=${workflowId}, total=${total}, returned=${runs.length}`,
      'RunsService',
    );

    return result;
  }

  /**
   * Get all runs for a user (optionally filtered by workflow)
   */
  async getAllRuns(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: WorkflowRunStatus,
    workflowId?: string,
  ): Promise<PaginatedRunResponseDto> {
    this.loggingService.info(
      `getAllRuns - Started: userId=${userId}, page=${page}, limit=${limit}, status=${status}, workflowId=${workflowId}`,
      'RunsService',
    );

    // Build cache key
    const cacheKey = `${this.CACHE_PREFIX}:user:${userId}:page:${page}:limit:${limit}:status:${status || 'all'}:workflow:${workflowId || 'all'}`;

    // Try cache first
    const cached = await this.cacheService.get<PaginatedRunResponseDto>(cacheKey);
    if (cached) {
      this.loggingService.debug(
        `getAllRuns - Cache hit: userId=${userId}`,
        'RunsService',
      );
      return cached;
    }

    // Build query
    const queryBuilder = this.runRepository
      .createQueryBuilder('run')
      .leftJoinAndSelect('run.workflow', 'workflow')
      .where('run.userId = :userId', { userId })
      .orderBy('run.startedAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('run.status = :status', { status });
    }

    if (workflowId) {
      queryBuilder.andWhere('run.workflowId = :workflowId', { workflowId });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const skip = (page - 1) * limit;
    const runs = await queryBuilder.skip(skip).take(limit).getMany();

    // Transform to DTOs (include workflow info)
    const data = runs.map((run) => this.toResponseDto(run, true));

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    const result = new PaginatedRunResponseDto({
      data,
      total,
      page,
      limit,
      totalPages,
    });

    // Cache result
    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    this.loggingService.info(
      `getAllRuns - Completed: userId=${userId}, total=${total}, returned=${runs.length}`,
      'RunsService',
    );

    return result;
  }

  /**
   * Get a specific run by ID
   */
  async getRunById(runId: string, userId: string): Promise<RunResponseDto> {
    this.loggingService.info(
      `getRunById - Started: runId=${runId}, userId=${userId}`,
      'RunsService',
    );

    // Build cache key
    const cacheKey = `${this.CACHE_PREFIX}:${runId}`;

    // Try cache first
    const cached = await this.cacheService.get<RunResponseDto>(cacheKey);
    if (cached) {
      this.loggingService.debug(
        `getRunById - Cache hit: runId=${runId}`,
        'RunsService',
      );
      return cached;
    }

    // Get run with workflow
    const run = await this.runRepository.findOne({
      where: { id: runId },
      relations: ['workflow'],
    });

    if (!run) {
      this.loggingService.warn(
        `getRunById - Run not found: runId=${runId}`,
        'RunsService',
      );
      throw new NotFoundException(`Run with ID ${runId} not found`);
    }

    // Verify ownership
    if (run.userId !== userId) {
      this.loggingService.warn(
        `getRunById - Access denied: runId=${runId}, userId=${userId}, ownerId=${run.userId}`,
        'RunsService',
      );
      throw new ForbiddenException('You do not have access to this run');
    }

    const result = this.toResponseDto(run, true);

    // Cache result
    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    this.loggingService.info(
      `getRunById - Completed: runId=${runId}`,
      'RunsService',
    );

    return result;
  }
}
