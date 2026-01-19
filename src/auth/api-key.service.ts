import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

import { ApiKey, ApiKeyScope } from '../shared/entities/api-key.entity';
import { User } from '../shared/entities/user.entity';
import { PasswordService } from './password.service';
import { CacheService } from '../shared/cache/cache.service';

// DTOs
import { CreateApiKeyDto } from './dto/create-api-key.dto';

export interface ApiKeyWithSecret {
  apiKey: ApiKey;
  secret: string; // Only returned once during creation
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Create a new API key for a user
   */
  async createApiKey(userId: string, createApiKeyDto: CreateApiKeyDto): Promise<ApiKeyWithSecret> {
    this.logger.log(`createApiKey - Started: ${JSON.stringify({ userId, name: createApiKeyDto.name })}`);

    try {
      // Check if user exists
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check if API key with same name already exists for this user
      const existingApiKey = await this.apiKeyRepository.findOne({
        where: { userId, name: createApiKeyDto.name },
      });

      if (existingApiKey) {
        throw new ConflictException('API key with this name already exists');
      }

      // Generate API key
      const secret = this.generateApiKeySecret();
      const keyHash = await this.passwordService.hashPassword(secret);
      const keyPrefix = secret.substring(0, 8);

      // Create API key entity
      const apiKey = this.apiKeyRepository.create({
        userId,
        name: createApiKeyDto.name,
        keyHash,
        keyPrefix,
        scopes: createApiKeyDto.scopes || [ApiKeyScope.WORKFLOWS_READ, ApiKeyScope.WORKFLOWS_WRITE],
        active: true,
        expiresAt: createApiKeyDto.expiresAt,
      });

      const savedApiKey = await this.apiKeyRepository.save(apiKey);

      this.logger.log(`createApiKey - Completed: API key ${savedApiKey.id} created for user ${userId}`);

      return {
        apiKey: savedApiKey,
        secret,
      };
    } catch (error) {
      this.logger.error(`createApiKey - Error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all API keys for a user
   */
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    this.logger.log(`getUserApiKeys - Started: ${JSON.stringify({ userId })}`);

    try {
      const apiKeys = await this.apiKeyRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      });

      this.logger.log(`getUserApiKeys - Completed: Found ${apiKeys.length} API keys for user ${userId}`);

      return apiKeys;
    } catch (error) {
      this.logger.error(`getUserApiKeys - Error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete an API key
   */
  async deleteApiKey(userId: string, apiKeyId: string): Promise<void> {
    this.logger.log(`deleteApiKey - Started: ${JSON.stringify({ userId, apiKeyId })}`);

    try {
      const apiKey = await this.apiKeyRepository.findOne({
        where: { id: apiKeyId, userId },
      });

      if (!apiKey) {
        throw new NotFoundException('API key not found');
      }

      await this.apiKeyRepository.remove(apiKey);

      // Clear from cache if exists
      await this.cacheService.clearPattern(`api_key:${apiKey.keyPrefix}*`);

      this.logger.log(`deleteApiKey - Completed: API key ${apiKeyId} deleted for user ${userId}`);
    } catch (error) {
      this.logger.error(`deleteApiKey - Error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate an API key and return the associated user
   */
  async validateApiKey(secret: string): Promise<User | null> {
    this.logger.log('validateApiKey - Started');

    try {
      // Extract prefix from secret
      const keyPrefix = secret.substring(0, 8);

      // Try to get from cache first
      const cachedUserId = await this.cacheService.get<string>(`api_key:${keyPrefix}`);
      if (cachedUserId) {
        const user = await this.userRepository.findOne({ where: { id: cachedUserId } });
        if (user) {
          this.logger.log(`validateApiKey - Completed: API key validated from cache for user ${user.id}`);
          return user;
        }
      }

      // Find API key by prefix
      const apiKey = await this.apiKeyRepository.findOne({
        where: { keyPrefix, active: true },
        relations: ['user'],
      });

      if (!apiKey) {
        this.logger.log('validateApiKey - Completed: API key not found');
        return null;
      }

      // Check if API key is expired
      if (apiKey.isExpired) {
        this.logger.log('validateApiKey - Completed: API key is expired');
        return null;
      }

      // Verify the secret
      const isValid = await this.passwordService.comparePasswords(secret, apiKey.keyHash);
      if (!isValid) {
        this.logger.log('validateApiKey - Completed: Invalid API key secret');
        return null;
      }

      // Update last used timestamp
      await this.apiKeyRepository.update(apiKey.id, {
        lastUsedAt: new Date(),
      });

      // Cache the user ID for future requests
      await this.cacheService.set(`api_key:${keyPrefix}`, apiKey.user.id, 300); // 5 minutes

      this.logger.log(`validateApiKey - Completed: API key validated for user ${apiKey.user.id}`);

      return apiKey.user;
    } catch (error) {
      this.logger.error(`validateApiKey - Error: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get API key by ID (for the owner)
   */
  async getApiKeyById(userId: string, apiKeyId: string): Promise<ApiKey> {
    this.logger.log(`getApiKeyById - Started: ${JSON.stringify({ userId, apiKeyId })}`);

    try {
      const apiKey = await this.apiKeyRepository.findOne({
        where: { id: apiKeyId, userId },
      });

      if (!apiKey) {
        throw new NotFoundException('API key not found');
      }

      this.logger.log(`getApiKeyById - Completed: API key ${apiKeyId} found for user ${userId}`);

      return apiKey;
    } catch (error) {
      this.logger.error(`getApiKeyById - Error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update API key (activate/deactivate, update expiration)
   */
  async updateApiKey(
    userId: string,
    apiKeyId: string,
    updates: Partial<Pick<ApiKey, 'active' | 'expiresAt' | 'name'>>,
  ): Promise<ApiKey> {
    this.logger.log(`updateApiKey - Started: ${JSON.stringify({ userId, apiKeyId, updates })}`);

    try {
      const apiKey = await this.getApiKeyById(userId, apiKeyId);

      // Update the API key
      Object.assign(apiKey, updates);
      const updatedApiKey = await this.apiKeyRepository.save(apiKey);

      // Clear cache to force re-validation
      await this.cacheService.clearPattern(`api_key:${apiKey.keyPrefix}*`);

      this.logger.log(`updateApiKey - Completed: API key ${apiKeyId} updated for user ${userId}`);

      return updatedApiKey;
    } catch (error) {
      this.logger.error(`updateApiKey - Error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate a secure API key secret
   */
  private generateApiKeySecret(): string {
    // Generate a secure random string
    // Format: wf_<32 random characters>
    const randomBytes = crypto.randomBytes(24); // 24 bytes = 32 base64 characters (after removing padding)
    const randomString = randomBytes.toString('base64').replace(/[+/=]/g, '').substring(0, 32);
    
    return `wf_${randomString}`;
  }
}