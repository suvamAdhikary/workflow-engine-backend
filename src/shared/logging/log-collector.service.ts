import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggingService, LogLevel, LogContext } from './logging.service';

export interface ImportantLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: LogContext;
  tags: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface LogMetrics {
  totalLogs: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  debugCount: number;
  averageResponseTime: number;
  slowQueries: number;
  failedRequests: number;
  securityEvents: number;
}

@Injectable()
export class LogCollectorService implements OnModuleInit, OnModuleDestroy {
  private importantLogs: ImportantLog[] = [];
  private logMetrics: LogMetrics = {
    totalLogs: 0,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    debugCount: 0,
    averageResponseTime: 0,
    slowQueries: 0,
    failedRequests: 0,
    securityEvents: 0,
  };
  private metricsInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: LoggingService,
  ) {
    this.loggingService.setContext(LogCollectorService.name);
  }

  async onModuleInit() {
    this.loggingService.info('LogCollectorService - Started: Initializing log collection');

    // Start metrics collection interval
    this.startMetricsCollection();

    // Start cleanup interval for old logs
    this.startLogCleanup();

    this.loggingService.info('LogCollectorService - Completed: Log collection initialized');
  }

  async onModuleDestroy() {
    this.loggingService.info('LogCollectorService - Started: Shutting down log collection');

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Export final metrics and important logs
    await this.exportLogs();

    this.loggingService.info('LogCollectorService - Completed: Log collection shutdown');
  }

  /**
   * Collect important logs that need special attention
   */
  collectImportantLog(
    level: LogLevel,
    message: string,
    context?: string,
    metadata?: LogContext,
    tags: string[] = [],
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
  ): void {
    const importantLog: ImportantLog = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      metadata,
      tags: [...tags, level, context || 'unknown'].filter(Boolean),
      severity,
    };

    this.importantLogs.push(importantLog);

    // Keep only last 1000 important logs in memory
    if (this.importantLogs.length > 1000) {
      this.importantLogs = this.importantLogs.slice(-1000);
    }

    // Log critical events immediately
    if (severity === 'critical') {
      this.loggingService.error(`CRITICAL LOG COLLECTED: ${message}`, undefined, 'LogCollector', {
        logId: importantLog.id,
        severity,
        tags,
        ...metadata,
      });
    }

    this.updateMetrics(level, metadata);
  }

  /**
   * Collect security-related logs
   */
  collectSecurityLog(
    event: string,
    userId?: string,
    ip?: string,
    userAgent?: string,
    metadata?: LogContext,
  ): void {
    this.collectImportantLog(
      LogLevel.WARN,
      `Security event: ${event}`,
      'Security',
      {
        event,
        userId,
        ip,
        userAgent,
        type: 'security',
        ...metadata,
      },
      ['security', event],
      event.includes('failed') || event.includes('unauthorized') ? 'high' : 'medium',
    );
  }

  /**
   * Collect performance-related logs
   */
  collectPerformanceLog(
    operation: string,
    duration: number,
    threshold: number = 1000,
    metadata?: LogContext,
  ): void {
    const severity = duration > threshold * 2 ? 'high' : duration > threshold ? 'medium' : 'low';

    if (duration > threshold) {
      this.collectImportantLog(
        LogLevel.WARN,
        `Slow operation detected: ${operation} took ${duration}ms`,
        'Performance',
        {
          operation,
          duration,
          threshold,
          type: 'performance',
          ...metadata,
        },
        ['performance', 'slow_operation'],
        severity,
      );
    }
  }

  /**
   * Collect error logs with stack traces
   */
  collectErrorLog(
    error: Error,
    context?: string,
    metadata?: LogContext,
    severity: 'medium' | 'high' | 'critical' = 'high',
  ): void {
    this.collectImportantLog(
      LogLevel.ERROR,
      error.message,
      context,
      {
        errorName: error.name,
        stack: error.stack,
        type: 'error',
        ...metadata,
      },
      ['error', error.name.toLowerCase()],
      severity,
    );
  }

  /**
   * Collect workflow execution logs
   */
  collectWorkflowLog(
    event: string,
    workflowId: string,
    runId: string,
    status: 'success' | 'failed' | 'skipped',
    duration?: number,
    metadata?: LogContext,
  ): void {
    const severity = status === 'failed' ? 'high' : 'medium';
    const level = status === 'failed' ? LogLevel.ERROR : LogLevel.INFO;

    this.collectImportantLog(
      level,
      `Workflow ${event}: ${workflowId} (${status})`,
      'WorkflowEngine',
      {
        event,
        workflowId,
        runId,
        status,
        duration,
        type: 'workflow',
        ...metadata,
      },
      ['workflow', event, status],
      severity,
    );
  }

  /**
   * Get important logs with filtering
   */
  getImportantLogs(
    level?: LogLevel,
    context?: string,
    tags?: string[],
    severity?: string,
    limit: number = 100,
  ): ImportantLog[] {
    let filtered = this.importantLogs;

    if (level) {
      filtered = filtered.filter((log) => log.level === level);
    }

    if (context) {
      filtered = filtered.filter((log) => log.context === context);
    }

    if (tags && tags.length > 0) {
      filtered = filtered.filter((log) => tags.some((tag) => log.tags.includes(tag)));
    }

    if (severity) {
      filtered = filtered.filter((log) => log.severity === severity);
    }

    return filtered
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get current log metrics
   */
  getLogMetrics(): LogMetrics {
    return { ...this.logMetrics };
  }

  /**
   * Get log summary for monitoring dashboards
   */
  getLogSummary(): {
    metrics: LogMetrics;
    criticalLogs: ImportantLog[];
    recentErrors: ImportantLog[];
    securityEvents: ImportantLog[];
  } {
    return {
      metrics: this.getLogMetrics(),
      criticalLogs: this.getImportantLogs(undefined, undefined, undefined, 'critical', 10),
      recentErrors: this.getImportantLogs(LogLevel.ERROR, undefined, undefined, undefined, 20),
      securityEvents: this.getImportantLogs(undefined, undefined, ['security'], undefined, 15),
    };
  }

  /**
   * Export logs to external systems (e.g., ELK, CloudWatch, etc.)
   */
  private async exportLogs(): Promise<void> {
    try {
      const summary = this.getLogSummary();

      // In production, you would send this to your log aggregation service
      // For now, we'll just log the summary
      this.loggingService.info('Exporting log summary', 'LogCollector', {
        totalImportantLogs: this.importantLogs.length,
        criticalLogsCount: summary.criticalLogs.length,
        errorLogsCount: summary.recentErrors.length,
        securityEventsCount: summary.securityEvents.length,
        metrics: summary.metrics,
      });

      // TODO: Implement actual export to external services
      // Examples:
      // - Send to Elasticsearch
      // - Send to AWS CloudWatch
      // - Send to Datadog
      // - Send to custom monitoring service
    } catch (error) {
      this.loggingService.error('Failed to export logs', error.stack, 'LogCollector', {
        error: error.message,
      });
    }
  }

  /**
   * Start metrics collection interval
   */
  private startMetricsCollection(): void {
    const intervalMs = this.configService.get('LOG_METRICS_INTERVAL', 60000); // 1 minute

    this.metricsInterval = setInterval(() => {
      this.collectMetricsSnapshot();
    }, intervalMs);
  }

  /**
   * Start log cleanup interval
   */
  private startLogCleanup(): void {
    const intervalMs = this.configService.get('LOG_CLEANUP_INTERVAL', 3600000); // 1 hour

    this.cleanupInterval = setInterval(() => {
      this.cleanupOldLogs();
    }, intervalMs);
  }

  /**
   * Collect periodic metrics snapshot
   */
  private collectMetricsSnapshot(): void {
    const summary = this.getLogSummary();

    this.loggingService.info('Log metrics snapshot', 'LogCollector', {
      type: 'metrics_snapshot',
      ...summary.metrics,
    });
  }

  /**
   * Clean up old logs from memory
   */
  private cleanupOldLogs(): void {
    const maxAge = this.configService.get('LOG_MAX_AGE_HOURS', 24) * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxAge;

    const initialCount = this.importantLogs.length;
    this.importantLogs = this.importantLogs.filter(
      (log) => new Date(log.timestamp).getTime() > cutoffTime,
    );

    const cleanedCount = initialCount - this.importantLogs.length;

    if (cleanedCount > 0) {
      this.loggingService.debug(`Cleaned up ${cleanedCount} old logs`, 'LogCollector', {
        cleanedCount,
        remainingCount: this.importantLogs.length,
        maxAgeHours: this.configService.get('LOG_MAX_AGE_HOURS', 24),
      });
    }
  }

  /**
   * Update internal metrics
   */
  private updateMetrics(level: LogLevel, metadata?: LogContext): void {
    this.logMetrics.totalLogs++;

    switch (level) {
      case LogLevel.ERROR:
        this.logMetrics.errorCount++;
        break;
      case LogLevel.WARN:
        this.logMetrics.warnCount++;
        break;
      case LogLevel.INFO:
        this.logMetrics.infoCount++;
        break;
      case LogLevel.DEBUG:
        this.logMetrics.debugCount++;
        break;
    }

    if (metadata?.duration) {
      // Update average response time
      const currentAvg = this.logMetrics.averageResponseTime;
      const totalRequests = this.logMetrics.totalLogs;
      this.logMetrics.averageResponseTime =
        (currentAvg * (totalRequests - 1) + metadata.duration) / totalRequests;

      // Count slow queries
      if (metadata.type === 'database' && metadata.duration > 1000) {
        this.logMetrics.slowQueries++;
      }
    }

    if (metadata?.statusCode && metadata.statusCode >= 400) {
      this.logMetrics.failedRequests++;
    }

    if (metadata?.type === 'security') {
      this.logMetrics.securityEvents++;
    }
  }

  /**
   * Generate unique log ID
   */
  private generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
