import { Test, TestingModule } from '@nestjs/testing';
import { FilterProcessor } from './filter.processor';
import { ContextManager } from '../context.manager';
import { LoggingService } from '../../shared/logging/logging.service';
import { WorkflowRunStatus } from '../../shared/entities/workflow-run.entity';

describe('FilterProcessor', () => {
  let processor: FilterProcessor;
  let contextManager: ContextManager;
  let loggingService: LoggingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilterProcessor,
        {
          provide: ContextManager,
          useValue: {
            clone: jest.fn((obj) => ({ ...obj })),
            getValue: jest.fn(),
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

    processor = module.get<FilterProcessor>(FilterProcessor);
    contextManager = module.get<ContextManager>(ContextManager);
    loggingService = module.get<LoggingService>(LoggingService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('execute', () => {
    it('should pass when all conditions are met', async () => {
      const step = {
        type: 'filter',
        conditions: [
          { path: 'event_type', op: 'eq', value: 'user.signup' },
          { path: 'user.active', op: 'eq', value: true },
        ],
      };

      const context = {
        event_type: 'user.signup',
        user: { active: true, email: 'test@example.com' },
      };

      jest
        .spyOn(contextManager, 'getValue')
        .mockReturnValueOnce('user.signup') // event_type
        .mockReturnValueOnce(true); // user.active

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(result.shouldSkip).toBe(false);
      expect(result.context).toEqual(context);
    });

    it('should skip when conditions are not met', async () => {
      const step = {
        type: 'filter',
        conditions: [{ path: 'event_type', op: 'eq', value: 'user.signup' }],
      };

      const context = {
        event_type: 'user.login',
        user: { email: 'test@example.com' },
      };

      jest.spyOn(contextManager, 'getValue').mockReturnValueOnce('user.login'); // event_type

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SKIPPED);
      expect(result.shouldSkip).toBe(true);
      expect(result.metadata?.reason).toBe('Filter conditions not met');
    });

    it('should handle neq operator correctly', async () => {
      const step = {
        type: 'filter',
        conditions: [{ path: 'status', op: 'neq', value: 'inactive' }],
      };

      const context = { status: 'active' };

      jest.spyOn(contextManager, 'getValue').mockReturnValueOnce('active');

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
      expect(result.shouldSkip).toBe(false);
    });

    it('should handle non-existent paths', async () => {
      const step = {
        type: 'filter',
        conditions: [{ path: 'non.existent.path', op: 'eq', value: 'test' }],
      };

      const context = { other: 'data' };

      jest.spyOn(contextManager, 'getValue').mockReturnValueOnce(undefined);

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SKIPPED);
      expect(result.shouldSkip).toBe(true);
    });

    it('should handle null and undefined values', async () => {
      const step = {
        type: 'filter',
        conditions: [{ path: 'nullable_field', op: 'eq', value: null }],
      };

      const context = { nullable_field: null };

      jest.spyOn(contextManager, 'getValue').mockReturnValueOnce(null);

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
    });

    it('should handle multiple conditions (AND logic)', async () => {
      const step = {
        type: 'filter',
        conditions: [
          { path: 'user.role', op: 'eq', value: 'admin' },
          { path: 'user.verified', op: 'eq', value: true },
          { path: 'action', op: 'neq', value: 'delete' },
        ],
      };

      const context = {
        user: { role: 'admin', verified: true },
        action: 'create',
      };

      jest
        .spyOn(contextManager, 'getValue')
        .mockReturnValueOnce('admin') // user.role
        .mockReturnValueOnce(true) // user.verified
        .mockReturnValueOnce('create'); // action

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SUCCESS);
    });

    it('should fail when one condition in AND logic fails', async () => {
      const step = {
        type: 'filter',
        conditions: [
          { path: 'user.role', op: 'eq', value: 'admin' },
          { path: 'user.verified', op: 'eq', value: true },
        ],
      };

      const context = {
        user: { role: 'user', verified: true }, // role is 'user', not 'admin'
      };

      jest
        .spyOn(contextManager, 'getValue')
        .mockReturnValueOnce('user') // user.role
        .mockReturnValueOnce(true); // user.verified

      const result = await processor.execute(step, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SKIPPED);
      expect(result.shouldSkip).toBe(true);
    });

    it('should handle validation errors', async () => {
      const step = {
        type: 'filter',
        // Missing conditions
      };

      const context = { test: 'data' };

      const result = await processor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(WorkflowRunStatus.FAILED);
      expect(result.error?.code).toBe('FILTER_EXECUTION_ERROR');
    });

    it('should handle empty conditions array', async () => {
      const step = {
        type: 'filter',
        conditions: [],
      };

      const context = { test: 'data' };

      const result = await processor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(WorkflowRunStatus.FAILED);
    });

    it('should handle type coercion correctly', async () => {
      const step = {
        type: 'filter',
        conditions: [
          { path: 'count', op: 'eq', value: '5' }, // String '5'
        ],
      };

      const context = { count: 5 }; // Number 5

      jest.spyOn(contextManager, 'getValue').mockReturnValueOnce(5);

      const result = await processor.execute(step, context);

      // Should not match due to type difference (strict equality)
      expect(result.success).toBe(true);
      expect(result.status).toBe(WorkflowRunStatus.SKIPPED);
    });
  });

  describe('validate', () => {
    it('should validate correct filter step', () => {
      const step = {
        type: 'filter',
        conditions: [{ path: 'test', op: 'eq', value: 'value' }],
      };

      expect(() => processor.validate(step)).not.toThrow();
    });

    it('should throw for invalid step type', () => {
      const step = {
        type: 'transform',
        conditions: [],
      };

      expect(() => processor.validate(step)).toThrow('Invalid filter step');
    });

    it('should throw for missing conditions', () => {
      const step = {
        type: 'filter',
      };

      expect(() => processor.validate(step)).toThrow('Filter step must have conditions array');
    });

    it('should throw for empty conditions', () => {
      const step = {
        type: 'filter',
        conditions: [],
      };

      expect(() => processor.validate(step)).toThrow(
        'Filter step must have at least one condition',
      );
    });

    it('should throw for invalid condition structure', () => {
      const step = {
        type: 'filter',
        conditions: [
          { path: 'test' }, // Missing op and value
        ],
      };

      expect(() => processor.validate(step)).toThrow(
        'Filter condition must have path, op, and value',
      );
    });

    it('should throw for invalid operator', () => {
      const step = {
        type: 'filter',
        conditions: [{ path: 'test', op: 'invalid', value: 'test' }],
      };

      expect(() => processor.validate(step)).toThrow('Invalid filter operator');
    });
  });
});
