import { BadRequestException } from '@nestjs/common';

/**
 * Input sanitization utilities for webhook payloads and template variables
 */
export class InputSanitizer {
  private static readonly MAX_OBJECT_DEPTH = 50;
  private static readonly MAX_STRING_LENGTH = 10000;
  private static readonly MAX_ARRAY_LENGTH = 1000;
  private static readonly MAX_OBJECT_KEYS = 1000;

  /**
   * Sanitize and validate webhook payload
   * @param payload - The input payload to sanitize
   * @returns Sanitized payload
   * @throws BadRequestException if payload is invalid
   */
  static sanitizePayload(payload: any): Record<string, any> {
    if (payload === null || payload === undefined) {
      return {};
    }

    if (typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('Payload must be a JSON object');
    }

    return this.sanitizeObject(payload, 0);
  }

  /**
   * Sanitize template variables to prevent injection attacks
   * @param template - The template string
   * @returns Sanitized template
   */
  static sanitizeTemplate(template: string): string {
    if (typeof template !== 'string') {
      throw new BadRequestException('Template must be a string');
    }

    if (template.length > this.MAX_STRING_LENGTH) {
      throw new BadRequestException(`Template too long (max ${this.MAX_STRING_LENGTH} characters)`);
    }

    // Remove potentially dangerous patterns
    const sanitized = template
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/<script[^>]*>.*?<\/script>/gis, '') // Remove script tags
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/eval\s*\(/gi, '') // Remove eval calls
      .replace(/Function\s*\(/gi, ''); // Remove Function constructor

    return sanitized;
  }

  /**
   * Validate and sanitize object recursively
   * @param obj - Object to sanitize
   * @param depth - Current recursion depth
   * @returns Sanitized object
   */
  private static sanitizeObject(obj: any, depth: number): Record<string, any> {
    if (depth > this.MAX_OBJECT_DEPTH) {
      throw new BadRequestException(
        `Object nesting too deep (max ${this.MAX_OBJECT_DEPTH} levels)`,
      );
    }

    if (obj === null || obj === undefined) {
      return {};
    }

    if (typeof obj !== 'object') {
      return this.sanitizeValue(obj);
    }

    if (Array.isArray(obj)) {
      if (obj.length > this.MAX_ARRAY_LENGTH) {
        throw new BadRequestException(`Array too large (max ${this.MAX_ARRAY_LENGTH} items)`);
      }
      return obj.map((item) => this.sanitizeValue(item, depth + 1));
    }

    // Check for circular references
    if (this.hasCircularReference(obj)) {
      throw new BadRequestException('Circular references not allowed in payload');
    }

    const keys = Object.keys(obj);
    if (keys.length > this.MAX_OBJECT_KEYS) {
      throw new BadRequestException(`Too many object keys (max ${this.MAX_OBJECT_KEYS})`);
    }

    const sanitized: Record<string, any> = {};
    for (const key of keys) {
      // Sanitize key name
      const sanitizedKey = this.sanitizeKey(key);
      if (sanitizedKey) {
        sanitized[sanitizedKey] = this.sanitizeValue(obj[key], depth + 1);
      }
    }

    return sanitized;
  }

  /**
   * Sanitize individual values
   * @param value - Value to sanitize
   * @param depth - Current recursion depth
   * @returns Sanitized value
   */
  private static sanitizeValue(value: any, depth = 0): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      if (value.length > this.MAX_STRING_LENGTH) {
        throw new BadRequestException(`String too long (max ${this.MAX_STRING_LENGTH} characters)`);
      }
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'object') {
      return this.sanitizeObject(value, depth);
    }

    // For functions, symbols, etc., convert to string representation
    return String(value);
  }

  /**
   * Sanitize object key names
   * @param key - Key to sanitize
   * @returns Sanitized key or null if invalid
   */
  private static sanitizeKey(key: string): string | null {
    if (typeof key !== 'string') {
      return null;
    }

    if (key.length > 100) {
      throw new BadRequestException('Object key too long (max 100 characters)');
    }

    // Remove potentially dangerous key patterns
    if (key.startsWith('__') || key.includes('..') || key.includes('/')) {
      return null;
    }

    return key;
  }

  /**
   * Check for circular references in an object
   * @param obj - Object to check
   * @param seen - Set of already seen objects
   * @returns True if circular reference found
   */
  private static hasCircularReference(obj: any, seen = new WeakSet()): boolean {
    if (obj === null || typeof obj !== 'object') {
      return false;
    }

    if (seen.has(obj)) {
      return true;
    }

    seen.add(obj);

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (this.hasCircularReference(obj[key], seen)) {
          return true;
        }
      }
    }

    seen.delete(obj);
    return false;
  }

  /**
   * Validate template variable path to prevent path traversal
   * @param path - Variable path (e.g., "user.email", "data.items[0].name")
   * @returns True if path is safe
   */
  static isValidTemplatePath(path: string): boolean {
    if (typeof path !== 'string' || path.length === 0) {
      return false;
    }

    // Check for path traversal attempts
    if (path.includes('..') || path.includes('//') || path.startsWith('/')) {
      return false;
    }

    // Check for dangerous patterns
    if (path.includes('__proto__') || path.includes('constructor') || path.includes('prototype')) {
      return false;
    }

    // Allow only alphanumeric, dots, brackets, and underscores
    const validPathRegex = /^[a-zA-Z0-9._\[\]]+$/;
    return validPathRegex.test(path);
  }
}
