import { WorkflowRunStatus } from '../../shared/entities/workflow-run.entity';

/**
 * Step execution result
 */
export interface StepExecutionResult {
  /**
   * Whether the step execution was successful
   */
  success: boolean;

  /**
   * The updated context after step execution
   */
  context: Record<string, any>;

  /**
   * Status of the step execution
   */
  status: WorkflowRunStatus;

  /**
   * Error details if step failed
   */
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };

  /**
   * Whether to skip remaining steps (for filter step)
   */
  shouldSkip?: boolean;

  /**
   * Additional metadata about the execution
   */
  metadata?: Record<string, any>;
}

/**
 * Interface for step processors
 * Each step type (filter, transform, http_request) implements this
 */
export interface IStepProcessor {
  /**
   * Execute the step with the given context
   *
   * @param step - The step definition from the workflow
   * @param context - The current execution context
   * @returns The result of the step execution
   */
  execute(step: Record<string, any>, context: Record<string, any>): Promise<StepExecutionResult>;

  /**
   * Validate the step configuration
   *
   * @param step - The step definition to validate
   * @returns True if valid, throws error otherwise
   */
  validate(step: Record<string, any>): boolean;
}
