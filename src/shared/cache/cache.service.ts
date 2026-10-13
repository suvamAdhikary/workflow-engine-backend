import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class CacheService {
  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
    private readonly configService: ConfigService,
    private readonly loggingService: LoggingService,
  ) {
    this.loggingService.setContext(CacheService.name);
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();

    try {
      const cached = await this.redisClient.get(key);
      const duration = Date.now() - startTime;
      const hit = cached !== null;

      this.loggingService.logCacheOperation('GET', key, hit, duration);

      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.error(
        `get - Error retrieving key ${key}: ${error.message}`,
        error.stack,
        'CacheService',
        {
          key,
          operation: 'GET',
          duration,
        },
      );
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const startTime = Date.now();

    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.redisClient.setex(key, ttl, serialized);
      } else {
        await this.redisClient.set(key, serialized);
      }

      const duration = Date.now() - startTime;
      this.loggingService.logCacheOperation('SET', key, undefined, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.error(
        `set - Error setting key ${key}: ${error.message}`,
        error.stack,
        'CacheService',
        {
          key,
          operation: 'SET',
          ttl,
          duration,
        },
      );
    }
  }

  /**
   * Delete a key from cache
   */
  async del(key: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.redisClient.del(key);
      const duration = Date.now() - startTime;
      this.loggingService.logCacheOperation('DEL', key, undefined, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.error(
        `del - Error deleting key ${key}: ${error.message}`,
        error.stack,
        'CacheService',
        {
          key,
          operation: 'DEL',
          duration,
        },
      );
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const startTime = Date.now();

    try {
      const values = await this.redisClient.mget(...keys);
      return values.map((value) => (value ? JSON.parse(value) : null));
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.error(
        `mget - Error retrieving keys: ${error.message}`,
        error.stack,
        'CacheService',
        {
          keys,
          operation: 'MGET',
          duration,
        },
      );
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple key-value pairs
   */
  async mset(keyValuePairs: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const startTime = Date.now();

    try {
      const pipeline = this.redisClient.pipeline();

      keyValuePairs.forEach(({ key, value, ttl }) => {
        const serialized = JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      });

      await pipeline.exec();
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.error(
        `mset - Error setting multiple keys: ${error.message}`,
        error.stack,
        'CacheService',
        {
          keyCount: keyValuePairs.length,
          operation: 'MSET',
          duration,
        },
      );
    }
  }

  /**
   * Check and update rate limit
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const current = await this.redisClient.incr(`rate_limit:${key}`);

      if (current === 1) {
        await this.redisClient.expire(`rate_limit:${key}`, windowSeconds);
      }

      const ttl = await this.redisClient.ttl(`rate_limit:${key}`);
      const allowed = current <= limit;
      const remaining = Math.max(0, limit - current);
      const resetTime = Date.now() + ttl * 1000;

      return { allowed, remaining, resetTime };
    } catch (error) {
      this.loggingService.error(
        `checkRateLimit - Error: ${error.message}`,
        error.stack,
        'CacheService',
        {
          key,
          limit,
          windowSeconds,
          operation: 'RATE_LIMIT',
        },
      );
      return { allowed: true, remaining: limit, resetTime: Date.now() + windowSeconds * 1000 }; // Fail open
    }
  }

  /**
   * Store refresh token
   */
  async setRefreshToken(userId: string, token: string): Promise<void> {
    const ttl = this.configService.get('redis.ttl.refreshToken', 7 * 24 * 60 * 60);
    await this.set(`refresh_token:${userId}`, token, ttl);
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(userId: string): Promise<string | null> {
    return this.get<string>(`refresh_token:${userId}`);
  }

  /**
   * Delete refresh token
   */
  async deleteRefreshToken(userId: string): Promise<void> {
    await this.del(`refresh_token:${userId}`);
  }

  /**
   * Store user session
   */
  async setUserSession(userId: string, sessionData: any): Promise<void> {
    const ttl = this.configService.get('redis.ttl.userSession', 24 * 60 * 60);
    await this.set(`session:${userId}`, sessionData, ttl);
  }

  /**
   * Get user session
   */
  async getUserSession(userId: string): Promise<any | null> {
    return this.get(`session:${userId}`);
  }

  /**
   * Delete user session
   */
  async deleteUserSession(userId: string): Promise<void> {
    await this.del(`session:${userId}`);
  }

  /**
   * Cache workflow definition
   */
  async setWorkflow(workflowId: string, workflow: any): Promise<void> {
    const ttl = this.configService.get('redis.ttl.workflow', 60 * 60);
    await this.set(`workflow:${workflowId}`, workflow, ttl);
  }

  /**
   * Get cached workflow
   */
  async getWorkflow(workflowId: string): Promise<any | null> {
    return this.get(`workflow:${workflowId}`);
  }

  /**
   * Cache trigger path lookup
   */
  async setTriggerPath(triggerPath: string, workflowId: string): Promise<void> {
    const ttl = this.configService.get('redis.ttl.triggerPath', 6 * 60 * 60);
    await this.set(`trigger:${triggerPath}`, workflowId, ttl);
  }

  /**
   * Get workflow ID by trigger path
   */
  async getWorkflowIdByTriggerPath(triggerPath: string): Promise<string | null> {
    return this.get<string>(`trigger:${triggerPath}`);
  }

  /**
   * Clear cache for a specific pattern
   */
  async clearPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redisClient.keys(pattern);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      this.loggingService.error(
        `clearPattern - Error clearing pattern ${pattern}: ${error.message}`,
        error.stack,
        'CacheService',
        {
          pattern,
          operation: 'CLEAR_PATTERN',
        },
      );
    }
  }

  /**
   * Get Redis client for advanced operations
   */
  getClient(): Redis {
    return this.redisClient;
  }
}
