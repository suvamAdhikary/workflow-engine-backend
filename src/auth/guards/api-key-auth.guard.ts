import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

import { ApiKeyStrategy } from '../strategies/api-key.strategy';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly apiKeyStrategy: ApiKeyStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    try {
      const user = await this.apiKeyStrategy.validate(request);
      request.user = user;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid API key');
    }
  }
}