import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  workflowId?: string;
  runId?: string;
  method?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
  duration?: number;
  statusCode?: number;
  [key: string]: any;
}

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: LogContext;
  stack?: string;
  correlationId?: string;
}

@Injectable({ scope: Scope.TRANSIENT })
export class LoggingService implements LoggerService {
  private readonly logger: winston.Logger;
  private context?: string;
  private correlationId?: string;

  constructor(private readonly configService: ConfigService) {
    this.logger = this.createLogger();
  }

  /**
   * Set the context for this logger instance
   */
  setContext(context: string): void {
    this.context = context;
  }

  /**
   * Set correlation ID for tracking related logs
   */
  setCorrelationId(correlationId?: string): void {
    this.correlationId = correlationId || uuidv4();
  }

  /**
   * Log error messages
   */
  error(message: string, stack?: string, context?: string, metadata?: LogContext): void {
    this.log(LogLevel.ERROR, message, context, metadata, stack);
  }

  /**
   * Log warning messages
   */
  warn(message: string, context?: string, metadata?: LogContext): void {
    this.log(LogLevel.WARN, message, context, metadata);
  }

  /**
   * Log info messages
   */
  info(message: string, context?: string, metadata?: LogContext): void {
    this.log(LogLevel.INFO, message, context, metadata);
  }

  /**
   * Log debug messages
   */
  debug(message: string, context?: string, metadata?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context, metadata);
  }

  /**
   * Log verbose messages
   */
  verbose(message: string, context?: string, metadata?: LogContext): void {
    this.log(LogLevel.VERBOSE, message, context, metadata);
  }

  /**
   * Generic log method (for NestJS compatibility)
   */
  log(level: LogLevel | string, message: string, context?: string, metadata?: LogContext, stack?: string): void {
    const logLevel = typeof level === 'string' && level in LogLevel ? level as LogLevel : LogLevel.INFO;
    
    const structuredLog: StructuredLog = {
      timestamp: new Date().toISOString(),
      level: logLevel,
      message,
      context: context || this.context,
      correlationId: this.correlationId,
      metadata: this.sanitizeMetadata(metadata),
      ...(stack && { stack }),
    };

    this.logger.log(logLevel, message, structuredLog);
  }

  /**
   * Log method start with arguments
   */
  logMethodStart(methodName: string, args?: any, context?: string): void {
    this.info(
      `${methodName} - Started`,
      context || this.context,
      {
        method: methodName,
        args: this.sanitizeArgs(args),
        phase: 'start',
      }
    );
  }

  /**
   * Log method completion with result
   */
  logMethodEnd(methodName: string, result?: any, duration?: number, context?: string): void {
    this.info(
      `${methodName} - Completed`,
      context || this.context,
      {
        method: methodName,
        result: this.sanitizeResult(result),
        duration,
        phase: 'end',
      }
    );
  }

  /**
   * Log method error
   */
  logMethodError(methodName: string, error: Error, args?: any, context?: string): void {
    this.error(
      `${methodName} - Error: ${error.message}`,
      error.stack,
      context || this.context,
      {
        method: methodName,
        args: this.sanitizeArgs(args),
        errorName: error.name,
        phase: 'error',
      }
    );
  }

  /**
   * Log database operations
   */
  logDatabaseOperation(operation: string, table: string, duration?: number, metadata?: LogContext): void {
    this.debug(
      `Database ${operation} on ${table}`,
      'Database',
      {
        operation,
        table,
        duration,
        type: 'database',
        ...metadata,
      }
    );
  }

  /**
   * Log cache operations
   */
  logCacheOperation(operation: string, key: string, hit?: boolean, duration?: number): void {
    this.debug(
      `Cache ${operation} for key: ${key}`,
      'Cache',
      {
        operation,
        key,
        hit,
        duration,
        type: 'cache',
      }
    );
  }

  /**
   * Log HTTP requests
   */
  logHttpRequest(method: string, url: string, statusCode: number, duration: number, metadata?: LogContext): void {
    const level = statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(
      level,
      `${method} ${url} ${statusCode} ${duration}ms`,
      'HTTP',
      {
        method,
        url,
        statusCode,
        duration,
        type: 'http_request',
        ...metadata,
      }
    );
  }

  /**
   * Log external API calls
   */
  logExternalApiCall(
    service: string,
    method: string,
    url: string,
    statusCode?: number,
    duration?: number,
    error?: string
  ): void {
    const level = error || (statusCode && statusCode >= 400) ? LogLevel.ERROR : LogLevel.INFO;
    const message = error 
      ? `External API call to ${service} failed: ${error}`
      : `External API call to ${service}: ${method} ${url} ${statusCode} ${duration}ms`;

    this.log(
      level,
      message,
      'ExternalAPI',
      {
        service,
        method,
        url,
        statusCode,
        duration,
        error,
        type: 'external_api',
      }
    );
  }

  /**
   * Log workflow execution events
   */
  logWorkflowEvent(
    event: 'started' | 'completed' | 'failed' | 'step_started' | 'step_completed' | 'step_failed',
    workflowId: string,
    runId: string,
    metadata?: LogContext
  ): void {
    const level = event.includes('failed') ? LogLevel.ERROR : LogLevel.INFO;
    
    this.log(
      level,
      `Workflow ${event}: ${workflowId}`,
      'WorkflowEngine',
      {
        event,
        workflowId,
        runId,
        type: 'workflow_execution',
        ...metadata,
      }
    );
  }

  /**
   * Log security events
   */
  logSecurityEvent(
    event: 'login' | 'logout' | 'failed_login' | 'token_refresh' | 'api_key_used' | 'unauthorized_access',
    userId?: string,
    metadata?: LogContext
  ): void {
    const level = event.includes('failed') || event === 'unauthorized_access' ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(
      level,
      `Security event: ${event}`,
      'Security',
      {
        event,
        userId,
        type: 'security',
        ...metadata,
      }
    );
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetric(metric: string, value: number, unit: string, metadata?: LogContext): void {
    this.info(
      `Performance metric: ${metric} = ${value}${unit}`,
      'Performance',
      {
        metric,
        value,
        unit,
        type: 'performance',
        ...metadata,
      }
    );
  }

  /**
   * Create Winston logger instance
   */
  private createLogger(): winston.Logger {
    const logLevel = this.configService.get('LOG_LEVEL', 'info');
    const nodeEnv = this.configService.get('NODE_ENV', 'development');
    const isDevelopment = nodeEnv === 'development';

    const formats = [
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
    ];

    // Add colorization for development
    if (isDevelopment) {
      formats.push(winston.format.colorize());
    }

    // Add JSON formatting for production
    if (!isDevelopment) {
      formats.push(
        winston.format.printf(({ timestamp, level, message, context, correlationId, metadata, stack }) => {
          const logObject: any = {
            timestamp,
            level,
            message,
            context: context || 'App',
          };
          
          if (correlationId) {
            logObject.correlationId = correlationId;
          }
          
          if (metadata && typeof metadata === 'object' && metadata !== null && Object.keys(metadata).length > 0) {
            logObject.metadata = metadata;
          }
          
          if (stack) {
            logObject.stack = stack;
          }
          return JSON.stringify(logObject);
        })
      );
    } else {
      formats.push(
        winston.format.printf(({ timestamp, level, message, context, correlationId, metadata, stack }) => {
          let log = `${timestamp} [${context || 'App'}] ${level}: ${message}`;
          
          if (correlationId) {
            log += ` [${correlationId}]`;
          }
          
          if (metadata && Object.keys(metadata).length > 0) {
            log += ` ${JSON.stringify(metadata)}`;
          }
          
          if (stack) {
            log += `\n${stack}`;
          }
          
          return log;
        })
      );
    }

    const transports: winston.transport[] = [
      new winston.transports.Console({
        level: logLevel,
        format: winston.format.combine(...formats),
      }),
    ];

    // Add file transports for production
    if (!isDevelopment) {
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 10,
        })
      );
    }

    return winston.createLogger({
      level: logLevel,
      transports,
      exitOnError: false,
    });
  }

  /**
   * Sanitize metadata to remove sensitive information
   */
  private sanitizeMetadata(metadata?: LogContext): LogContext | undefined {
    if (!metadata) return undefined;

    const sensitiveFields = [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'apiKey',
      'secret',
      'authorization',
      'cookie',
    ];

    const sanitized = { ...metadata };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Sanitize method arguments
   */
  private sanitizeArgs(args?: any): any {
    if (!args) return undefined;

    if (typeof args === 'object') {
      return this.sanitizeMetadata(args);
    }

    return args;
  }

  /**
   * Sanitize method result
   */
  private sanitizeResult(result?: any): any {
    if (!result) return undefined;

    // Don't log large results
    if (typeof result === 'object') {
      const stringified = JSON.stringify(result);
      if (stringified.length > 1000) {
        return '[LARGE_OBJECT]';
      }
      return this.sanitizeMetadata(result);
    }

    return result;
  }
}