import { IsString, IsOptional, IsArray, IsDateString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import { ApiKeyScope } from '../../shared/entities/api-key.entity';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'Human-readable name for the API key',
    example: 'Production Integration Key',
  })
  @IsString()
  @MinLength(1, { message: 'API key name is required' })
  @MaxLength(100, { message: 'API key name must be no more than 100 characters long' })
  name: string;

  @ApiProperty({
    description: 'Scopes/permissions for the API key',
    enum: ApiKeyScope,
    isArray: true,
    example: [ApiKeyScope.WORKFLOWS_READ, ApiKeyScope.WORKFLOWS_WRITE],
    required: false,
  })
  @IsOptional()
  @IsArray()
  scopes?: ApiKeyScope[];

  @ApiProperty({
    description: 'API key expiration date (ISO string)',
    example: '2024-12-31T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDateString({}, { message: 'Expiration date must be a valid ISO date string' })
  @Type(() => Date)
  expiresAt?: Date;
}
