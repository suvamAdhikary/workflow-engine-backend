import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

import { ApiKeyService, ApiKeyWithSecret } from './api-key.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

// DTOs
import { CreateApiKeyDto } from './dto/create-api-key.dto';

// Entities
import { ApiKey } from '../shared/entities/api-key.entity';

@ApiTags('API Keys')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @ApiOperation({
    summary: 'Create a new API key',
    description: 'Generate a new API key for the authenticated user. The secret is only returned once.',
  })
  @ApiResponse({
    status: 201,
    description: 'API key created successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            apiKey: {
              $ref: '#/components/schemas/ApiKey',
            },
            secret: {
              type: 'string',
              example: 'wf_1234567890abcdef1234567890abcdef',
              description: 'The API key secret - store this securely as it will not be shown again',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'API key with this name already exists',
  })
  @Post()
  async createApiKey(
    @CurrentUser('id') userId: string,
    @Body() createApiKeyDto: CreateApiKeyDto,
  ): Promise<ApiKeyWithSecret> {
    return this.apiKeyService.createApiKey(userId, createApiKeyDto);
  }

  @ApiOperation({
    summary: 'Get all API keys',
    description: 'Retrieve all API keys for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'API keys retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            $ref: '#/components/schemas/ApiKey',
          },
        },
      },
    },
  })
  @Get()
  async getUserApiKeys(@CurrentUser('id') userId: string): Promise<ApiKey[]> {
    return this.apiKeyService.getUserApiKeys(userId);
  }

  @ApiOperation({
    summary: 'Get API key by ID',
    description: 'Retrieve a specific API key by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'API key ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'API key retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          $ref: '#/components/schemas/ApiKey',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'API key not found',
  })
  @Get(':id')
  async getApiKeyById(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) apiKeyId: string,
  ): Promise<ApiKey> {
    return this.apiKeyService.getApiKeyById(userId, apiKeyId);
  }

  @ApiOperation({
    summary: 'Update API key',
    description: 'Update API key properties like name, active status, or expiration date.',
  })
  @ApiParam({
    name: 'id',
    description: 'API key ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'API key updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          $ref: '#/components/schemas/ApiKey',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'API key not found',
  })
  @Patch(':id')
  async updateApiKey(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) apiKeyId: string,
    @Body() updates: Partial<Pick<ApiKey, 'active' | 'expiresAt' | 'name'>>,
  ): Promise<ApiKey> {
    return this.apiKeyService.updateApiKey(userId, apiKeyId, updates);
  }

  @ApiOperation({
    summary: 'Delete API key',
    description: 'Permanently delete an API key. This action cannot be undone.',
  })
  @ApiParam({
    name: 'id',
    description: 'API key ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'API key deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'API key deleted successfully' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'API key not found',
  })
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async deleteApiKey(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) apiKeyId: string,
  ): Promise<{ message: string }> {
    await this.apiKeyService.deleteApiKey(userId, apiKeyId);
    return { message: 'API key deleted successfully' };
  }
}