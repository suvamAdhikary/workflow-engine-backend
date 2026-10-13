import { Injectable } from '@nestjs/common';
import { LoggingService } from '../../shared/logging/logging.service';
import { ContextManager } from '../context.manager';
import { IStepProcessor, StepExecutionResult } from '../interfaces/step-processor.interface';
import { WorkflowRunStatus } from '../../shared/entities/workflow-run.entity';

/**
 * Filter operation types
 */
export enum FilterOperation {
  EQUALS = 'eq',
  NOT_EQUALS = 'neq',
}

/**
 * Filter condition
 */
export interface FilterCondition {
  path: string;
  op: FilterOperation;
  value: any;
}

/**
 * Filter step definition
 */
export interface FilterStep {
  type: 'filter';
  conditions: FilterCondition[];
}

/**
 * FilterProcessor
 *
 * Executes filter steps to conditionally control workflow execution.
 * If conditions don't match, the workflow is short-circuited with 'skipped' status.
 */
@Injectable()
export class FilterProcessor implements IStepProcessor {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Execute the filter step
   * Evaluates all conditions and returns success only if ALL match
   */
  async execute(step: FilterStep, context: Record<string, any>): Promise<StepExecutionResult> {
    this.loggingService.debug('FilterProcessor - Executing filter step', 'FilterProcessor', {
      conditionCount: step.conditions?.length,
    });

    try {
      // Validate step structure
      this.validate(step);

      // Evaluate all conditions
      const allConditionsMet = this.evaluateConditions(step.conditions, context);

      if (allConditionsMet) {
        this.loggingService.debug(
          'FilterProcessor - All conditions met, continuing workflow',
          'FilterProcessor',
        );

        return {
          success: true,
          context, // Pass context unchanged
          status: WorkflowRunStatus.SUCCESS,
          shouldSkip: false,
        };
      } else {
        this.loggingService.info(
          'FilterProcessor - Conditions not met, skipping workflow',
          'FilterProcessor',
        );

        return {
          success: true, // Filter worked correctly
          context,
          status: WorkflowRunStatus.SKIPPED,
          shouldSkip: true, // Signal to skip remaining steps
          metadata: {
            reason: 'Filter conditions not met',
          },
        };
      }
    } catch (error) {
      this.loggingService.error(
        'FilterProcessor - Error executing filter step',
        error.stack,
        'FilterProcessor',
        { error: error.message },
      );

      return {
        success: false,
        context,
        status: WorkflowRunStatus.FAILED,
        error: {
          message: `Filter step failed: ${error.message}`,
          stack: error.stack,
          code: 'FILTER_EXECUTION_ERROR',
        },
      };
    }
  }

  /**
   * Evaluate all filter conditions
   * Returns true only if ALL conditions match (AND logic)
   */
  private evaluateConditions(conditions: FilterCondition[], context: Record<string, any>): boolean {
    for (const condition of conditions) {
      const actualValue = this.contextManager.get(context, condition.path);
      const expectedValue = condition.value;
      const matches = this.evaluateCondition(condition.op, actualValue, expectedValue);

      this.loggingService.debug(
        `FilterProcessor - Condition: ${condition.path} ${condition.op} ${JSON.stringify(expectedValue)} = ${matches}`,
        'FilterProcessor',
        { actualValue, expectedValue, matches },
      );

      if (!matches) {
        return false; // Short-circuit on first failure
      }
    }

    return true; // All conditions matched
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    operation: FilterOperation,
    actualValue: any,
    expectedValue: any,
  ): boolean {
    switch (operation) {
      case FilterOperation.EQUALS:
        return this.isEqual(actualValue, expectedValue);

      case FilterOperation.NOT_EQUALS:
        return !this.isEqual(actualValue, expectedValue);

      default:
        throw new Error(`Unsupported filter operation: ${operation}`);
    }
  }

  /**
   * Deep equality check
   * Handles primitives, objects, and arrays
   */
  private isEqual(a: any, b: any): boolean {
    // Handle null/undefined
    if (a === b) return true;
    if (a == null || b == null) return false;

    // Handle different types
    if (typeof a !== typeof b) return false;

    // Handle primitives
    if (typeof a !== 'object') return a === b;

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, index) => this.isEqual(val, b[index]));
    }

    // Handle objects
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => this.isEqual(a[key], b[key]));
  }

  /**
   * Validate filter step configuration
   */
  validate(step: FilterStep): boolean {
    if (!step || step.type !== 'filter') {
      throw new Error('Invalid filter step: missing or incorrect type');
    }

    if (!Array.isArray(step.conditions) || step.conditions.length === 0) {
      throw new Error('Invalid filter step: conditions must be a non-empty array');
    }

    for (const condition of step.conditions) {
      if (!condition.path || typeof condition.path !== 'string') {
        throw new Error('Invalid filter condition: path is required and must be a string');
      }

      if (
        !condition.op ||
        !Object.values(FilterOperation).includes(condition.op as FilterOperation)
      ) {
        throw new Error(
          `Invalid filter condition: operation must be one of ${Object.values(FilterOperation).join(', ')}`,
        );
      }

      if (condition.value === undefined) {
        throw new Error('Invalid filter condition: value is required');
      }
    }

    return true;
  }
}
