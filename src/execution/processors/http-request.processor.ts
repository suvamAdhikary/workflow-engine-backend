import { Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { LoggingService } from '../../shared/logging/logging.service';
import { ContextManager } from '../context.manager';
import { IStepProcessor, StepExecutionResult } from '../interfaces/step-processor.interface';
import { WorkflowRunStatus } from '../../shared/entities/workflow-run.entity';

/**
 * HTTP methods
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
}

/**
 * Body modes
 */
export enum BodyMode {
  CTX = 'ctx',
  CUSTOM = 'custom',
}

/**
 * HTTP request step definition
 */
export interface HttpRequestStep {
  type: 'http_request';
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: {
    mode: BodyMode;
    value?: any;
  };
  timeoutMs?: number;
  retries?: number;
}

/**
 * HttpRequestProcessor
 * 
 * Executes HTTP request steps to call external APIs.
 * Supports GET/POST methods, custom headers, body modes, timeouts, and retries.
 */
@Injectable()
export class HttpRequestProcessor implements IStepProcessor {
  private readonly DEFAULT_TIMEOUT_MS = 5000; // 5 seconds
  private readonly DEFAULT_RETRIES = 0;
  private readonly RETRY_DELAY_MS = 1000; // 1 second base delay

  constructor(
    private readonly contextManager: ContextManager,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Execute the HTTP request step
   * Makes HTTP request with retries and timeout handling
   */
  async execute(
    step: HttpRequestStep,
    context: Record<string, any>,
  ): Promise<StepExecutionResult> {
    this.loggingService.info(
      `HttpRequestProcessor - Executing HTTP ${step.method} ${step.url}`,
      'HttpRequestProcessor',
    );

    try {
      // Validate step structure
      this.validate(step);

      // Prepare request configuration
      const config = await this.prepareRequestConfig(step, context);

      // Execute request with retries
      const response = await this.executeWithRetries(config, step.retries || this.DEFAULT_RETRIES);

      this.loggingService.info(
        `HttpRequestProcessor - HTTP request successful: ${response.status}`,
        'HttpRequestProcessor',
        { status: response.status, statusText: response.statusText },
      );

      // Update context with response (optional: could add response to context)
      return {
        success: true,
        context, // Keep context unchanged (per spec: no side effects)
        status: WorkflowRunStatus.SUCCESS,
        metadata: {
          httpStatus: response.status,
          httpStatusText: response.statusText,
          responseData: response.data,
        },
      };
    } catch (error) {
      this.loggingService.error(
        'HttpRequestProcessor - HTTP request failed',
        error.stack,
        'HttpRequestProcessor',
        { error: error.message, step: step.url },
      );

      return {
        success: false,
        context,
        status: WorkflowRunStatus.FAILED,
        error: {
          message: `HTTP request failed: ${error.message}`,
          stack: error.stack,
          code: this.getErrorCode(error),
        },
      };
    }
  }

  /**
   * Prepare axios request configuration
   */
  private async prepareRequestConfig(
    step: HttpRequestStep,
    context: Record<string, any>,
  ): Promise<AxiosRequestConfig> {
    // Replace template variables in URL
    const url = this.contextManager.replaceTemplateVars(step.url, context);

    // Replace template variables in headers
    const headers: Record<string, string> = {};
    if (step.headers) {
      for (const [key, value] of Object.entries(step.headers)) {
        headers[key] = this.contextManager.replaceTemplateVars(value, context);
      }
    }

    // Prepare body based on mode
    let data: any;
    if (step.method === HttpMethod.POST && step.body) {
      if (step.body.mode === BodyMode.CTX) {
        // Send entire context as JSON
        data = context;
      } else if (step.body.mode === BodyMode.CUSTOM) {
        // Replace template variables in custom body
        data = this.contextManager.replaceTemplateVarsInObject(step.body.value, context);
      }
    }

    const config: AxiosRequestConfig = {
      method: step.method,
      url,
      headers,
      data,
      timeout: step.timeoutMs || this.DEFAULT_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 300, // Only 2xx is success
    };

    this.loggingService.debug(
      `HttpRequestProcessor - Request config prepared`,
      'HttpRequestProcessor',
      { method: config.method, url: config.url, timeout: config.timeout },
    );

    return config;
  }

  /**
   * Execute HTTP request with exponential backoff retry logic
   */
  private async executeWithRetries(
    config: AxiosRequestConfig,
    retries: number,
  ): Promise<AxiosResponse> {
    let lastError: any;
    const maxAttempts = retries + 1; // retries + initial attempt

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.loggingService.debug(
          `HttpRequestProcessor - Attempt ${attempt}/${maxAttempts}`,
          'HttpRequestProcessor',
        );

        const response = await axios.request(config);
        
        this.loggingService.debug(
          `HttpRequestProcessor - Request succeeded on attempt ${attempt}`,
          'HttpRequestProcessor',
        );

        return response;
      } catch (error) {
        lastError = error;
        
        const isRetryable = this.isRetryableError(error);
        const hasRetriesLeft = attempt < maxAttempts;

        this.loggingService.warn(
          `HttpRequestProcessor - Attempt ${attempt}/${maxAttempts} failed: ${error.message}`,
          'HttpRequestProcessor',
          { isRetryable, hasRetriesLeft },
        );

        if (isRetryable && hasRetriesLeft) {
          // Calculate delay with exponential backoff: delay * 2^(attempt-1)
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          
          this.loggingService.info(
            `HttpRequestProcessor - Retrying in ${delay}ms...`,
            'HttpRequestProcessor',
          );

          await this.sleep(delay);
        } else {
          // No more retries or error is not retryable
          break;
        }
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Determine if an error is retryable
   * Retry on network errors and 5xx server errors
   */
  private isRetryableError(error: any): boolean {
    // Network errors (ECONNREFUSED, ETIMEDOUT, etc.)
    if (error.code && (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ENETUNREACH'
    )) {
      return true;
    }

    // HTTP 5xx errors
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Axios timeout errors
    if (error.code === 'ECONNABORTED') {
      return true;
    }

    return false;
  }

  /**
   * Get error code for logging
   */
  private getErrorCode(error: any): string {
    if (error.code) {
      return error.code;
    }

    if (error.response) {
      return `HTTP_${error.response.status}`;
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate HTTP request step configuration
   */
  validate(step: HttpRequestStep): boolean {
    if (!step || step.type !== 'http_request') {
      throw new Error('Invalid HTTP request step: missing or incorrect type');
    }

    if (!step.method || !Object.values(HttpMethod).includes(step.method as HttpMethod)) {
      throw new Error(`Invalid HTTP request step: method must be one of ${Object.values(HttpMethod).join(', ')}`);
    }

    if (!step.url || typeof step.url !== 'string') {
      throw new Error('Invalid HTTP request step: url is required and must be a string');
    }

    if (step.headers && typeof step.headers !== 'object') {
      throw new Error('Invalid HTTP request step: headers must be an object');
    }

    if (step.body) {
      if (!step.body.mode || !Object.values(BodyMode).includes(step.body.mode as BodyMode)) {
        throw new Error(`Invalid HTTP request step: body.mode must be one of ${Object.values(BodyMode).join(', ')}`);
      }

      if (step.body.mode === BodyMode.CUSTOM && step.body.value === undefined) {
        throw new Error('Invalid HTTP request step: body.value is required when mode is "custom"');
      }
    }

    if (step.timeoutMs !== undefined && (typeof step.timeoutMs !== 'number' || step.timeoutMs <= 0)) {
      throw new Error('Invalid HTTP request step: timeoutMs must be a positive number');
    }

    if (step.retries !== undefined && (typeof step.retries !== 'number' || step.retries < 0)) {
      throw new Error('Invalid HTTP request step: retries must be a non-negative number');
    }

    return true;
  }
}
