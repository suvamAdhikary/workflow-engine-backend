import { Test, TestingModule } from '@nestjs/testing';
import { TransformProcessor } from './transform.processor';
import { ContextManager } from '../context.manager';
import { LoggingService } from '../../shared/logging/logging.service';
import { WorkflowRunStatus } from '../../shared/entities/workflow-run.entity';

describe('TransformProcessor', () => {
  let processor: TransformProcessor;
  let contextManager: ContextManager;
  let loggingService: LoggingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransformProcessor,
        {
          provide: ContextManager,
          useValue: {
            clone: jest.fn((obj) => ({ ...obj })),
            getValue: jest.fn(),
            setValue: jest.fn(),
            renderTemplate: jest.fn(),
          },
        },
        {
          provide: LoggingService,
          useValue: {
            debug: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<TransformProcessor>(TransformProcessor);
    contextManager = module.get<ContextManager>(ContextManager);
    loggingService = module.get<LoggingService>(LoggingService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('execute', () => {
    it('should execute template operation successfully', async () => {
      const step = {
        type: 'transform',
        ops: [
          {
            op: 'template',
            to: 'message',
            template: 'Hello {{user.name}}!',
          },
        ],
      };

      const context = {
        user: { name: 'John Doe', email: 'john@example.com' },
      };

      const expectedContext = {
        ...context,
        message: 'Hello John Doe!',
      };

      jest.spyOn(contextManager, 'clone').mockReturnValue({ ...context });
      jest.spyOn(contextManager, 'renderTemplate').mockReturnValue('Hello John Doe!');
      jest.spyOn(contextManager, 'setValue').mockImplementation((ctx, path, value) => {
        ctx[path] = value;
        return ctx;
      });

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(contextManager.renderTemplate).toHaveBeenCalledWith('Hello {{user.name}}!', expect.any(Object));
      expect(contextManager.setValue).toHaveBeenCalledWith(expect.any(Object), 'message', 'Hello John Doe!');
    });

    it('should execute pick operation successfully', async () => {
      const step = {
        type: 'transform',
        ops: [
          {
            op: 'pick',
            to: 'user_info',
            from: 'user',
            fields: ['name', 'email'],
          },
        ],
      };

      const context = {
        user: { 
          name: 'John Doe', 
          email: 'john@example.com', 
          password: 'secret123',
          internal_id: 12345 
        },
      };

      jest.spyOn(contextManager, 'clone').mockReturnValue({ ...context });
      jest.spyOn(contextManager, 'getValue').mockReturnValue(context.user);
      jest.spyOn(contextManager, 'setValue').mockImplementation((ctx, path, value) => {
        ctx[path] = value;
        return ctx;
      });

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(contextManager.setValue).toHaveBeenCalledWith(
        expect.any(Object),
        'user_info',
        { name: 'John Doe', email: 'john@example.com' }
      );
    });

    it('should execute default operation when field is missing', async () => {
      const step = {
        type: 'transform',
        ops: [
          {
            op: 'default',
            to: 'status',
            value: 'active',
          },
        ],
      };

      const context = {
        user: { name: 'John Doe' },
        // status is missing
      };

      jest.spyOn(contextManager, 'clone').mockReturnValue({ ...context });
      jest.spyOn(contextManager, 'getValue').mockReturnValue(undefined); // status not found
      jest.spyOn(contextManager, 'setValue').mockImplementation((ctx, path, value) => {
        ctx[path] = value;
        return ctx;
      });

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(contextManager.setValue).toHaveBeenCalledWith(expect.any(Object), 'status', 'active');
    });

    it('should not execute default operation when field exists', async () => {
      const step = {
        type: 'transform',
        ops: [
          {
            op: 'default',
            to: 'status',
            value: 'active',
          },
        ],
      };

      const context = {
        user: { name: 'John Doe' },
        status: 'inactive', // status already exists
      };

      jest.spyOn(contextManager, 'clone').mockReturnValue({ ...context });
      jest.spyOn(contextManager, 'getValue').mockReturnValue('inactive'); // status found
      jest.spyOn(contextManager, 'setValue').mockImplementation((ctx, path, value) => {
        ctx[path] = value;
        return ctx;
      });

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(contextManager.setValue).not.toHaveBeenCalled(); // Should not set default
    });

    it('should execute multiple operations in sequence', async () => {
      const step = {
        type: 'transform',
        ops: [
          {
            op: 'template',
            to: 'greeting',
            template: 'Hello {{user.name}}',
          },
          {
            op: 'default',
            to: 'priority',
            value: 'normal',
          },
          {
            op: 'pick',
            to: 'summary',
            from: 'user',
            fields: ['name', 'email'],
          },
        ],
      };

      const context = {
        user: { name: 'John', email: 'john@test.com', age: 30 },
      };

      jest.spyOn(contextManager, 'clone').mockReturnValue({ ...context });
      jest.spyOn(contextManager, 'renderTemplate').mockReturnValue('Hello John');
      jest.spyOn(contextManager, 'getValue')
        .mockReturnValueOnce(undefined) // priority not found
        .mockReturnValueOnce(context.user); // user object for pick
      jest.spyOn(contextManager, 'setValue').mockImplementation((ctx, path, value) => {
        ctx[path] = value;
        return ctx;
      });

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(contextManager.setValue).toHaveBeenCalledTimes(3);
      expect(contextManager.setValue).toHaveBeenNthCalledWith(1, expect.any(Object), 'greeting', 'Hello John');
      expect(contextManager.setValue).toHaveBeenNthCalledWith(2, expect.any(Object), 'priority', 'normal');
      expect(contextManager.setValue).toHaveBeenNthCalledWith(3, expect.any(Object), 'summary', { name: 'John', email: 'john@test.com' });
    });

    it('should handle template rendering errors', async () => {
      const step = {
        type: 'transform',
        ops: [
          {
            op: 'template',
            to: 'message',
            template: 'Hello {{user.nonexistent.field}}',
          },
        ],
      };

      const context = { user: { name: 'John' } };

      jest.spyOn(contextManager, 'clone').mockReturnValue({ ...context });
      jest.spyOn(contextManager, 'renderTemplate').mockImplementation(() => {
        throw new Error('Template rendering failed');
      });

      const result = await processor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(WorkflowRunStatus.FAILED);
      expect(result.error?.code).toBe('TRANSFORM_EXECUTION_ERROR');
    });

    it('should handle pick operation on non-existent source', async () => {
      const step = {
        type: 'transform',
        ops: [
          {
            op: 'pick',
            to: 'result',
            from: 'nonexistent',
            fields: ['name'],
          },
        ],
      };

      const context = { user: { name: 'John' } };

      jest.spyOn(contextManager, 'clone').mockReturnValue({ ...context });
      jest.spyOn(contextManager, 'getValue').mockReturnValue(undefined);
      jest.spyOn(contextManager, 'setValue').mockImplementation((ctx, path, value) => {
        ctx[path] = value;
        return ctx;
      });

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(contextManager.setValue).toHaveBeenCalledWith(expect.any(Object), 'result', {});
    });

    it('should handle validation errors', async () => {
      const step = {
        type: 'transform',
        // Missing ops
      };

      const context = { test: 'data' };

      const result = await processor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(WorkflowRunStatus.FAILED);
      expect(result.error?.code).toBe('TRANSFORM_EXECUTION_ERROR');
    });
  });

  describe('validate', () => {
    it('should validate correct transform step', () => {
      const step = {
        type: 'transform',
        ops: [
          { op: 'template', to: 'message', template: 'Hello' },
        ],
      };

      expect(() => processor.validate(step)).not.toThrow();
    });

    it('should throw for invalid step type', () => {
      const step = {
        type: 'filter',
        ops: [],
      };

      expect(() => processor.validate(step)).toThrow('Invalid transform step');
    });

    it('should throw for missing ops', () => {
      const step = {
        type: 'transform',
      };

      expect(() => processor.validate(step)).toThrow('Transform step must have ops array');
    });

    it('should throw for empty ops', () => {
      const step = {
        type: 'transform',
        ops: [],
      };

      expect(() => processor.validate(step)).toThrow('Transform step must have at least one operation');
    });

    it('should throw for invalid operation type', () => {
      const step = {
        type: 'transform',
        ops: [
          { op: 'invalid', to: 'test' },
        ],
      };

      expect(() => processor.validate(step)).toThrow('Invalid transform operation');
    });

    it('should throw for template operation missing fields', () => {
      const step = {
        type: 'transform',
        ops: [
          { op: 'template', to: 'test' }, // Missing template
        ],
      };

      expect(() => processor.validate(step)).toThrow('Template operation must have to and template fields');
    });

    it('should throw for pick operation missing fields', () => {
      const step = {
        type: 'transform',
        ops: [
          { op: 'pick', to: 'test' }, // Missing from and fields
        ],
      };

      expect(() => processor.validate(step)).toThrow('Pick operation must have to, from, and fields');
    });

    it('should throw for default operation missing fields', () => {
      const step = {
        type: 'transform',
        ops: [
          { op: 'default', to: 'test' }, // Missing value
        ],
      };

      expect(() => processor.validate(step)).toThrow('Default operation must have to and value fields');
    });
  });
});