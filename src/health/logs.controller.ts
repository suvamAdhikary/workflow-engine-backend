import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../shared/entities/user.entity';
import {
  LogCollectorService,
  ImportantLog,
  LogMetrics,
} from '../shared/logging/log-collector.service';
import { LogLevel } from '../shared/logging/logging.service';

@ApiTags('Health')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('health/logs')
export class LogsController {
  constructor(private readonly logCollectorService: LogCollectorService) {}

  @ApiOperation({
    summary: 'Get log metrics',
    description: 'Get current log metrics and statistics. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Log metrics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            totalLogs: { type: 'number', example: 1500 },
            errorCount: { type: 'number', example: 25 },
            warnCount: { type: 'number', example: 100 },
            infoCount: { type: 'number', example: 1200 },
            debugCount: { type: 'number', example: 175 },
            averageResponseTime: { type: 'number', example: 250 },
            slowQueries: { type: 'number', example: 5 },
            failedRequests: { type: 'number', example: 15 },
            securityEvents: { type: 'number', example: 8 },
          },
        },
      },
    },
  })
  @Roles(UserRole.ADMIN)
  @Get('metrics')
  getLogMetrics(): LogMetrics {
    return this.logCollectorService.getLogMetrics();
  }

  @ApiOperation({
    summary: 'Get important logs',
    description: 'Get filtered important logs with optional filtering. Requires admin role.',
  })
  @ApiQuery({ name: 'level', required: false, enum: LogLevel, description: 'Filter by log level' })
  @ApiQuery({ name: 'context', required: false, type: 'string', description: 'Filter by context' })
  @ApiQuery({
    name: 'tags',
    required: false,
    type: 'string',
    description: 'Filter by tags (comma-separated)',
  })
  @ApiQuery({
    name: 'severity',
    required: false,
    enum: ['low', 'medium', 'high', 'critical'],
    description: 'Filter by severity',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Limit number of results (default: 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Important logs retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'log_1642234567890_abc123def' },
              timestamp: { type: 'string', example: '2024-01-15T10:30:00Z' },
              level: { type: 'string', enum: Object.values(LogLevel), example: 'error' },
              message: { type: 'string', example: 'Database connection failed' },
              context: { type: 'string', example: 'DatabaseService' },
              metadata: { type: 'object' },
              tags: { type: 'array', items: { type: 'string' } },
              severity: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
                example: 'high',
              },
            },
          },
        },
      },
    },
  })
  @Roles(UserRole.ADMIN)
  @Get('important')
  getImportantLogs(
    @Query('level') level?: LogLevel,
    @Query('context') context?: string,
    @Query('tags') tagsParam?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
  ): ImportantLog[] {
    const tags = tagsParam ? tagsParam.split(',').map((tag) => tag.trim()) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : 100;

    return this.logCollectorService.getImportantLogs(level, context, tags, severity, limitNum);
  }

  @ApiOperation({
    summary: 'Get log summary',
    description:
      'Get comprehensive log summary including metrics and critical logs. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Log summary retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            metrics: {
              type: 'object',
              properties: {
                totalLogs: { type: 'number' },
                errorCount: { type: 'number' },
                warnCount: { type: 'number' },
                infoCount: { type: 'number' },
                debugCount: { type: 'number' },
                averageResponseTime: { type: 'number' },
                slowQueries: { type: 'number' },
                failedRequests: { type: 'number' },
                securityEvents: { type: 'number' },
              },
            },
            criticalLogs: {
              type: 'array',
              items: { $ref: '#/components/schemas/ImportantLog' },
            },
            recentErrors: {
              type: 'array',
              items: { $ref: '#/components/schemas/ImportantLog' },
            },
            securityEvents: {
              type: 'array',
              items: { $ref: '#/components/schemas/ImportantLog' },
            },
          },
        },
      },
    },
  })
  @Roles(UserRole.ADMIN)
  @Get('summary')
  getLogSummary() {
    return this.logCollectorService.getLogSummary();
  }
}
