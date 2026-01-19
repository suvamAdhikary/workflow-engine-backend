import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

import { ApiKeyService } from '../api-key.service';
import { User } from '../../shared/entities/user.entity';

@Injectable()
export class ApiKeyStrategy {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async validate(req: Request): Promise<User> {
    const apiKey = this.extractApiKey(req);
    
    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    const user = await this.apiKeyService.validateApiKey(apiKey);
    
    if (!user) {
      throw new UnauthorizedException('Invalid API key');
    }

    return user;
  }

  private extractApiKey(req: Request): string | null {
    // Check Authorization header: Bearer <api-key>
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string') {
      return apiKeyHeader;
    }

    // Check query parameter
    const apiKeyQuery = req.query.api_key;
    if (apiKeyQuery && typeof apiKeyQuery === 'string') {
      return apiKeyQuery;
    }

    return null;
  }
}