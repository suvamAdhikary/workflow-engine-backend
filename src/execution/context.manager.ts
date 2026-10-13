import { Injectable } from '@nestjs/common';
import * as lodash from 'lodash';

/**
 * ContextManager
 *
 * Manages the execution context (ctx) for workflow runs.
 * Provides utilities for getting/setting values using dot-path notation.
 */
@Injectable()
export class ContextManager {
  /**
   * Get a value from context using dot-path notation
   *
   * @param context - The context object
   * @param path - Dot-separated path (e.g., 'user.profile.name')
   * @param defaultValue - Value to return if path doesn't exist
   * @returns The value at the path or defaultValue
   *
   * @example
   * const name = get({ user: { profile: { name: 'John' } } }, 'user.profile.name');
   * // Returns: 'John'
   */
  get(context: Record<string, any>, path: string, defaultValue: any = null): any {
    return lodash.get(context, path, defaultValue);
  }

  /**
   * Set a value in context using dot-path notation
   *
   * @param context - The context object
   * @param path - Dot-separated path
   * @param value - Value to set
   * @returns The updated context
   *
   * @example
   * const ctx = set({}, 'user.profile.name', 'John');
   * // Returns: { user: { profile: { name: 'John' } } }
   */
  set(context: Record<string, any>, path: string, value: any): Record<string, any> {
    return lodash.set(context, path, value);
  }

  /**
   * Check if a path exists in context
   *
   * @param context - The context object
   * @param path - Dot-separated path
   * @returns True if path exists
   */
  has(context: Record<string, any>, path: string): boolean {
    return lodash.has(context, path);
  }

  /**
   * Pick specific fields from context
   *
   * @param context - The context object
   * @param paths - Array of paths to pick
   * @returns New object with only specified paths
   *
   * @example
   * const picked = pick({ a: 1, b: 2, c: 3 }, ['a', 'c']);
   * // Returns: { a: 1, c: 3 }
   */
  pick(context: Record<string, any>, paths: string[]): Record<string, any> {
    return lodash.pick(context, paths);
  }

  /**
   * Merge values into context
   *
   * @param context - The context object
   * @param values - Values to merge
   * @returns The merged context
   */
  merge(context: Record<string, any>, values: Record<string, any>): Record<string, any> {
    return lodash.merge({}, context, values);
  }

  /**
   * Deep clone context to avoid mutations
   *
   * @param context - The context object
   * @returns A deep clone of the context
   */
  clone(context: Record<string, any>): Record<string, any> {
    return lodash.cloneDeep(context);
  }

  /**
   * Replace template variables in a string
   *
   * @param template - Template string with {{variable}} placeholders
   * @param context - The context object
   * @returns String with variables replaced
   *
   * @example
   * const result = replaceTemplateVars('Hello {{name}}!', { name: 'John' });
   * // Returns: 'Hello John!'
   */
  replaceTemplateVars(template: string, context: Record<string, any>): string {
    // Match {{variable}} patterns
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.get(context, path.trim());

      // Handle null/undefined values
      if (value === null || value === undefined) {
        return ''; // Return empty string for missing values
      }

      // Convert objects/arrays to JSON
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }

      return String(value);
    });
  }

  /**
   * Replace template variables in an object (recursively)
   *
   * @param obj - Object with potential template strings
   * @param context - The context object
   * @returns Object with variables replaced
   */
  replaceTemplateVarsInObject(obj: any, context: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.replaceTemplateVars(obj, context);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.replaceTemplateVarsInObject(item, context));
    }

    if (obj && typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceTemplateVarsInObject(value, context);
      }
      return result;
    }

    return obj;
  }
}
