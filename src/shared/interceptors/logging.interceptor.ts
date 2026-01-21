import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging.service';
import { LogCollectorService } from '../logging/log-collector.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly loggingService: LoggingService,
    private readonly logCollectorService: LogCollectorService,
  ) {
    this.loggingService.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    
    // Generate request ID if not present
    const requestId = request.headers['x-request-id'] as string || uuidv4();
    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-ID', requestId);

    const { method, url, body, query, params, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const ip = request.ip || request.connection.remoteAddress;
    const startTime = Date.now();

    // Set correlation ID for request tracing
    this.loggingService.setCorrelationId(requestId);

    // Log incoming request
    this.loggingService.info(`→ ${method} ${url}`, 'HttpRequest', {
      requestId,
      method,
      url,
      query: Object.keys(query).length > 0 ? query : undefined,
      params: Object.keys(params).length > 0 ? params : undefined,
      body: this.sanitizeBody(body),
      userAgent,
      ip,
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          
          // Log HTTP request
          this.loggingService.logHttpRequest(method, url, statusCode, duration, {
            requestId,
            responseSize: this.getResponseSize(data),
            userAgent,
            ip,
          });

          // Collect performance metrics for slow requests
          this.logCollectorService.collectPerformanceLog(
            `${method} ${url}`,
            duration,
            1000, // 1 second threshold
            { requestId, statusCode, userAgent, ip }
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode || 500;
          
          // Log HTTP request error
          this.loggingService.logHttpRequest(method, url, statusCode, duration, {
            requestId,
            error: error.message,
            userAgent,
            ip,
          });

          // Collect error log
          this.logCollectorService.collectErrorLog(
            error,
            'HTTP',
            {
              requestId,
              method,
              url,
              statusCode,
              duration,
              userAgent,
              ip,
            },
            statusCode >= 500 ? 'critical' : 'high'
          );
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'apiKey',
      'secret',
      'authorization',
    ];

    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Handle nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeBody(sanitized[key]);
      }
    }

    return sanitized;
  }

  private getResponseSize(data: any): number | undefined {
    if (!data) return undefined;
    
    try {
      return JSON.stringify(data).length;
    } catch {
      return undefined;
    }
  }
}