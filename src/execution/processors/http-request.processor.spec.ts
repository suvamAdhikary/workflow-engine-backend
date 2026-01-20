import { Test, TestingModule } from '@nestjs/testing';
import { HttpRequestProcessor } from './http-request.processor';
import { ContextManager } from '../context.manager';
import { LoggingService } from '../../shared/logging/logging.service';
import { WorkflowRunStatus } from '../../shared/entities/workflow-run.entity';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HttpRequestProcessor', () => {
  let processor: HttpRequestProcessor;
  let contextManager: ContextManager;
  let loggingService: LoggingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpRequestProcessor,
        {
          provide: ContextManager,
          useValue: {
            clone: jest.fn((obj) => ({ ...obj })),
            renderTemplate: jest.fn(),
          },
        },
        {
          provide: LoggingService,
          useValue: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<HttpRequestProcessor>(HttpRequestProcessor);
    contextManager = module.get<ContextManager>(ContextManager);
    loggingService = module.get<LoggingService>(LoggingService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('execute', () => {
    it('should execute GET request successfully', async () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://api.example.com/users',
      };

      const context = { user_id: '123' };

      const mockResponse = {
        status: 200,
        statusText: 'OK',
        data: { id: '123', name: 'John Doe' },
      };

      mockedAxios.mockResolvedValueOnce(mockResponse);
      jest.spyOn(contextManager, 'renderTemplate').mockImplementation((template) => template);

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(result.context).toEqual(context);
      expect(result.metadata?.httpStatus).toBe(200);
      expect(result.metadata?.responseData).toEqual(mockResponse.data);
      expect(mockedAxios).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://api.example.com/users',
        timeout: 5000,
        validateStatus: expect.any(Function),
      });
    });

    it('should execute POST request with body successfully', async () => {
      const step = {
        type: 'http_request',
        method: 'POST',
        url: 'https://api.example.com/users',
        body: {
          mode: 'custom',
          value: { name: '{{user.name}}', email: '{{user.email}}' },
        },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token123',
        },
      };

      const context = {
        user: { name: 'John Doe', email: 'john@example.com' },
      };

      const mockResponse = {
        status: 201,
        statusText: 'Created',
        data: { id: '456', name: 'John Doe' },
      };

      mockedAxios.mockResolvedValueOnce(mockResponse);
      jest.spyOn(contextManager, 'renderTemplate')
        .mockReturnValueOnce('John Doe') // user.name
        .mockReturnValueOnce('john@example.com'); // user.email

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(result.metadata?.httpStatus).toBe(201);
      expect(mockedAxios).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://api.example.com/users',
        data: { name: 'John Doe', email: 'john@example.com' },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token123',
        },
        timeout: 5000,
        validateStatus: expect.any(Function),
      });
    });

    it('should execute request with context body mode', async () => {
      const step = {
        type: 'http_request',
        method: 'POST',
        url: 'https://webhook.example.com',
        body: {
          mode: 'context',
        },
      };

      const context = {
        event: 'user.created',
        user: { id: '123', name: 'John' },
      };

      const mockResponse = {
        status: 200,
        statusText: 'OK',
        data: { success: true },
      };

      mockedAxios.mockResolvedValueOnce(mockResponse);

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(mockedAxios).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://webhook.example.com',
        data: context,
        timeout: 5000,
        validateStatus: expect.any(Function),
      });
    });

    it('should handle HTTP error responses', async () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://api.example.com/not-found',
      };

      const context = {};

      const mockError = {
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { error: 'Resource not found' },
        },
        message: 'Request failed with status code 404',
      };

      mockedAxios.mockRejectedValueOnce(mockError);

      const result = await processor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(WorkflowRunStatus.FAILED);
      expect(result.error?.message).toContain('HTTP request failed');
      expect(result.error?.code).toBe('HTTP_ERROR');
    });

    it('should handle network timeout', async () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://slow-api.example.com',
        timeoutMs: 1000,
      };

      const context = {};

      const mockError = {
        code: 'ECONNABORTED',
        message: 'timeout of 1000ms exceeded',
      };

      mockedAxios.mockRejectedValueOnce(mockError);

      const result = await processor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(WorkflowRunStatus.FAILED);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
    });

    it('should handle network connection errors', async () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://unreachable.example.com',
      };

      const context = {};

      const mockError = {
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND unreachable.example.com',
      };

      mockedAxios.mockRejectedValueOnce(mockError);

      const result = await processor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(WorkflowRunStatus.FAILED);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });

    it('should retry on transient failures', async () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://api.example.com/flaky',
        retries: 2,
      };

      const context = {};

      const mockError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
        },
        message: 'Request failed with status code 500',
      };

      const mockSuccess = {
        status: 200,
        statusText: 'OK',
        data: { success: true },
      };

      // First call fails, second call fails, third call succeeds
      mockedAxios
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockSuccess);

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(mockedAxios).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should fail after exhausting retries', async () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://api.example.com/always-fails',
        retries: 1,
      };

      const context = {};

      const mockError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
        },
        message: 'Request failed with status code 500',
      };

      mockedAxios.mockRejectedValue(mockError);

      const result = await processor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(WorkflowRunStatus.FAILED);
      expect(mockedAxios).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should handle template rendering in URL', async () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://api.example.com/users/{{user_id}}',
      };

      const context = { user_id: '123' };

      const mockResponse = {
        status: 200,
        statusText: 'OK',
        data: { id: '123' },
      };

      mockedAxios.mockResolvedValueOnce(mockResponse);
      jest.spyOn(contextManager, 'renderTemplate')
        .mockReturnValue('https://api.example.com/users/123');

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(contextManager.renderTemplate).toHaveBeenCalledWith(
        'https://api.example.com/users/{{user_id}}',
        context
      );
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/users/123',
        })
      );
    });

    it('should handle validation errors', async () => {
      const step = {
        type: 'http_request',
        // Missing method and url
      };

      const context = {};

      const result = await processor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(WorkflowRunStatus.FAILED);
      expect(result.error?.message).toContain('HTTP request failed');
    });
  });

  describe('validate', () => {
    it('should validate correct HTTP request step', () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://api.example.com',
      };

      expect(() => processor.validate(step)).not.toThrow();
    });

    it('should throw for invalid step type', () => {
      const step = {
        type: 'filter',
        method: 'GET',
        url: 'https://api.example.com',
      };

      expect(() => processor.validate(step)).toThrow('Invalid HTTP request step');
    });

    it('should throw for missing method', () => {
      const step = {
        type: 'http_request',
        url: 'https://api.example.com',
      };

      expect(() => processor.validate(step)).toThrow('method must be one of');
    });

    it('should throw for invalid method', () => {
      const step = {
        type: 'http_request',
        method: 'INVALID',
        url: 'https://api.example.com',
      };

      expect(() => processor.validate(step)).toThrow('method must be one of');
    });

    it('should throw for missing URL', () => {
      const step = {
        type: 'http_request',
        method: 'GET',
      };

      expect(() => processor.validate(step)).toThrow('url is required');
    });

    it('should throw for invalid headers type', () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://api.example.com',
        headers: 'invalid',
      };

      expect(() => processor.validate(step)).toThrow('headers must be an object');
    });

    it('should throw for invalid body mode', () => {
      const step = {
        type: 'http_request',
        method: 'POST',
        url: 'https://api.example.com',
        body: {
          mode: 'invalid',
        },
      };

      expect(() => processor.validate(step)).toThrow('body.mode must be one of');
    });

    it('should throw for custom body mode without value', () => {
      const step = {
        type: 'http_request',
        method: 'POST',
        url: 'https://api.example.com',
        body: {
          mode: 'custom',
        },
      };

      expect(() => processor.validate(step)).toThrow('body.value is required when mode is "custom"');
    });

    it('should throw for invalid timeout', () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://api.example.com',
        timeoutMs: -1,
      };

      expect(() => processor.validate(step)).toThrow('timeoutMs must be a positive number');
    });

    it('should throw for invalid retries', () => {
      const step = {
        type: 'http_request',
        method: 'GET',
        url: 'https://api.example.com',
        retries: -1,
      };

      expect(() => processor.validate(step)).toThrow('retries must be a non-negative number');
    });
  });
});