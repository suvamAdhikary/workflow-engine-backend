import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
  code?: string;
  requestId?: string;
  stack?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';

    // Handle different types of exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || message;
        error = responseObj.error || exception.name;
        code = responseObj.code || this.getErrorCode(status);
      }
    } else if (exception instanceof Error) {
      // Handle other types of errors
      message = exception.message;
      error = exception.name;
      code = 'INTERNAL_ERROR';

      // Log the full error for debugging
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
      code,
      requestId: request.headers['x-request-id'] as string,
    };

    // Include stack trace in development
    if (process.env.NODE_ENV === 'development' && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    // Log error details
    const logLevel = status >= 500 ? 'error' : 'warn';
    const requestId = errorResponse.requestId || 'no-id';

    // Format message for better logging (especially validation errors)
    let logMessage: string;
    if (Array.isArray(message)) {
      logMessage = `Validation failed: ${message.join(', ')}`;
    } else if (
      typeof message === 'string' &&
      message === 'Bad Request' &&
      exception instanceof HttpException
    ) {
      // Try to get more details from the original exception
      const exceptionResponse = exception.getResponse();
      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse &&
        'message' in exceptionResponse
      ) {
        const responseMessage = (exceptionResponse as any).message;
        if (Array.isArray(responseMessage)) {
          logMessage = `Validation failed: ${responseMessage.join(', ')}`;
        } else {
          logMessage = responseMessage || message;
        }
      } else {
        logMessage = message;
      }
    } else {
      logMessage = String(message);
    }

    const logContext = `HTTP ${status} ${request.method} ${request.url} - ${logMessage} [${requestId}]`;
    this.logger[logLevel](logContext, 'HttpExceptionFilter');

    // Set appropriate headers
    response.setHeader('Content-Type', 'application/json');

    // Add rate limit headers if applicable
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const retryAfter = request.headers['retry-after'];
      if (retryAfter) {
        response.setHeader('Retry-After', retryAfter);
      }
    }

    response.status(status).json(errorResponse);
  }

  private getErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_ERROR';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'INTERNAL_ERROR';
      case HttpStatus.BAD_GATEWAY:
        return 'BAD_GATEWAY';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      case HttpStatus.GATEWAY_TIMEOUT:
        return 'GATEWAY_TIMEOUT';
      default:
        return 'UNKNOWN_ERROR';
    }
  }
}
