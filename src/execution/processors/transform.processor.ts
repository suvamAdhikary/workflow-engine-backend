import { Injectable } from '@nestjs/common';
import { LoggingService } from '../../shared/logging/logging.service';
import { ContextManager } from '../context.manager';
import { IStepProcessor, StepExecutionResult } from '../interfaces/step-processor.interface';
import { WorkflowRunStatus } from '../../shared/entities/workflow-run.entity';

/**
 * Transform operation types
 */
export enum TransformOperation {
  TEMPLATE = 'template',
  DEFAULT = 'default',
  PICK = 'pick',
}

/**
 * Transform operations
 */
export interface TemplateOp {
  op: TransformOperation.TEMPLATE;
  to: string;
  template: string;
}

export interface DefaultOp {
  op: TransformOperation.DEFAULT;
  path: string;
  value: any;
}

export interface PickOp {
  op: TransformOperation.PICK;
  paths: string[];
}

export type TransformOp = TemplateOp | DefaultOp | PickOp;

/**
 * Transform step definition
 */
export interface TransformStep {
  type: 'transform';
  ops: TransformOp[];
}

/**
 * TransformProcessor
 *
 * Executes transform steps to manipulate the workflow context.
 * Supports template, default, and pick operations.
 */
@Injectable()
export class TransformProcessor implements IStepProcessor {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Execute the transform step
   * Applies all operations sequentially to the context
   */
  async execute(step: TransformStep, context: Record<string, any>): Promise<StepExecutionResult> {
    this.loggingService.debug(
      'TransformProcessor - Executing transform step',
      'TransformProcessor',
      { operationCount: step.ops?.length },
    );

    try {
      // Validate step structure
      this.validate(step);

      // Clone context to avoid mutations
      let updatedContext = this.contextManager.clone(context);

      // Apply each operation sequentially
      for (const op of step.ops) {
        updatedContext = await this.applyOperation(op, updatedContext);
      }

      this.loggingService.debug(
        'TransformProcessor - Transform completed successfully',
        'TransformProcessor',
      );

      return {
        success: true,
        context: updatedContext,
        status: WorkflowRunStatus.SUCCESS,
      };
    } catch (error) {
      this.loggingService.error(
        'TransformProcessor - Error executing transform step',
        error.stack,
        'TransformProcessor',
        { error: error.message },
      );

      return {
        success: false,
        context,
        status: WorkflowRunStatus.FAILED,
        error: {
          message: `Transform step failed: ${error.message}`,
          stack: error.stack,
          code: 'TRANSFORM_EXECUTION_ERROR',
        },
      };
    }
  }

  /**
   * Apply a single transform operation
   */
  private async applyOperation(
    op: TransformOp,
    context: Record<string, any>,
  ): Promise<Record<string, any>> {
    switch (op.op) {
      case TransformOperation.TEMPLATE:
        return this.applyTemplate(op as TemplateOp, context);

      case TransformOperation.DEFAULT:
        return this.applyDefault(op as DefaultOp, context);

      case TransformOperation.PICK:
        return this.applyPick(op as PickOp, context);

      default:
        throw new Error(`Unsupported transform operation: ${(op as any).op}`);
    }
  }

  /**
   * Apply template operation
   * Creates a new field by replacing {{variable}} placeholders
   */
  private applyTemplate(op: TemplateOp, context: Record<string, any>): Record<string, any> {
    this.loggingService.debug(
      `TransformProcessor - Applying template: ${op.to} = ${op.template}`,
      'TransformProcessor',
    );

    const result = this.contextManager.replaceTemplateVars(op.template, context);

    this.loggingService.debug(
      `TransformProcessor - Template result: ${op.to} = ${result}`,
      'TransformProcessor',
    );

    return this.contextManager.set(context, op.to, result);
  }

  /**
   * Apply default operation
   * Sets a default value if the field is missing, null, undefined, or empty string
   */
  private applyDefault(op: DefaultOp, context: Record<string, any>): Record<string, any> {
    const currentValue = this.contextManager.get(context, op.path);

    // Check if value is missing, null, undefined, or empty string
    const needsDefault = currentValue === null || currentValue === undefined || currentValue === '';

    if (needsDefault) {
      this.loggingService.debug(
        `TransformProcessor - Applying default: ${op.path} = ${JSON.stringify(op.value)}`,
        'TransformProcessor',
      );
      return this.contextManager.set(context, op.path, op.value);
    }

    this.loggingService.debug(
      `TransformProcessor - Skipping default (value exists): ${op.path} = ${JSON.stringify(currentValue)}`,
      'TransformProcessor',
    );

    return context;
  }

  /**
   * Apply pick operation
   * Keeps only specified fields in the context
   */
  private applyPick(op: PickOp, context: Record<string, any>): Record<string, any> {
    this.loggingService.debug(
      `TransformProcessor - Applying pick: keeping ${op.paths.join(', ')}`,
      'TransformProcessor',
    );

    const picked = this.contextManager.pick(context, op.paths);

    this.loggingService.debug(
      `TransformProcessor - Pick result: ${Object.keys(picked).length} fields`,
      'TransformProcessor',
    );

    return picked;
  }

  /**
   * Validate transform step configuration
   */
  validate(step: TransformStep): boolean {
    if (!step || step.type !== 'transform') {
      throw new Error('Invalid transform step: missing or incorrect type');
    }

    if (!Array.isArray(step.ops) || step.ops.length === 0) {
      throw new Error('Invalid transform step: ops must be a non-empty array');
    }

    for (const op of step.ops) {
      if (!op.op || !Object.values(TransformOperation).includes(op.op as TransformOperation)) {
        throw new Error(
          `Invalid transform operation: operation must be one of ${Object.values(TransformOperation).join(', ')}`,
        );
      }

      switch (op.op) {
        case TransformOperation.TEMPLATE:
          this.validateTemplateOp(op as TemplateOp);
          break;
        case TransformOperation.DEFAULT:
          this.validateDefaultOp(op as DefaultOp);
          break;
        case TransformOperation.PICK:
          this.validatePickOp(op as PickOp);
          break;
      }
    }

    return true;
  }

  private validateTemplateOp(op: TemplateOp): void {
    if (!op.to || typeof op.to !== 'string') {
      throw new Error('Invalid template operation: "to" is required and must be a string');
    }
    if (!op.template || typeof op.template !== 'string') {
      throw new Error('Invalid template operation: "template" is required and must be a string');
    }
  }

  private validateDefaultOp(op: DefaultOp): void {
    if (!op.path || typeof op.path !== 'string') {
      throw new Error('Invalid default operation: "path" is required and must be a string');
    }
    if (op.value === undefined) {
      throw new Error('Invalid default operation: "value" is required');
    }
  }

  private validatePickOp(op: PickOp): void {
    if (!Array.isArray(op.paths) || op.paths.length === 0) {
      throw new Error('Invalid pick operation: "paths" is required and must be a non-empty array');
    }
    if (!op.paths.every((p) => typeof p === 'string')) {
      throw new Error('Invalid pick operation: all paths must be strings');
    }
  }
}
