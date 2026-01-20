import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsArray,
  IsNotEmpty,
  ValidateNested,
  IsOptional,
  IsIn,
  IsObject,
  MinLength,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

// Trigger DTOs
export class HttpTriggerDto {
  @ApiProperty({ example: 'http', description: 'Trigger type' })
  @IsString()
  @IsIn(['http'])
  type: string;
}

// Step Operation DTOs
export class FilterConditionDto {
  @ApiProperty({ example: 'event_type', description: 'Path to field in context using dot notation' })
  @IsString()
  @IsNotEmpty()
  path: string;

  @ApiProperty({ example: 'eq', enum: ['eq', 'neq'], description: 'Comparison operator' })
  @IsString()
  @IsIn(['eq', 'neq'])
  op: string;

  @ApiProperty({ example: 'user.signup', description: 'Value to compare against' })
  @IsNotEmpty()
  value: any;
}

export class TransformOperationDto {
  @ApiProperty({ 
    example: 'template', 
    enum: ['template', 'default', 'pick'],
    description: 'Transform operation type' 
  })
  @IsString()
  @IsIn(['template', 'default', 'pick'])
  op: string;

  @ApiProperty({ example: 'message', description: 'Target field path (for template and default)', required: false })
  @IsString()
  @IsOptional()
  to?: string;

  @ApiProperty({ example: 'Hello {{name}}', description: 'Template string (for template op)', required: false })
  @IsString()
  @IsOptional()
  template?: string;

  @ApiProperty({ example: 'user_name', description: 'Source field path (for default op)', required: false })
  @IsString()
  @IsOptional()
  path?: string;

  @ApiProperty({ example: 'Unknown', description: 'Default value (for default op)', required: false })
  @IsOptional()
  value?: any;

  @ApiProperty({ 
    example: ['id', 'name', 'email'], 
    description: 'Fields to keep (for pick op)',
    type: [String],
    required: false 
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  paths?: string[];
}

export class HttpRequestBodyDto {
  @ApiProperty({ 
    example: 'ctx', 
    enum: ['ctx', 'custom'],
    description: 'Body mode - ctx sends entire context, custom sends custom object' 
  })
  @IsString()
  @IsIn(['ctx', 'custom'])
  mode: string;

  @ApiProperty({ 
    example: { text: '{{message}}' },
    description: 'Custom body object (only for custom mode)',
    required: false 
  })
  @IsObject()
  @IsOptional()
  value?: Record<string, any>;
}

// Step DTOs
export class FilterStepDto {
  @ApiProperty({ example: 'filter', description: 'Step type' })
  @IsString()
  @IsIn(['filter'])
  type: string;

  @ApiProperty({ 
    type: [FilterConditionDto],
    description: 'Array of conditions - all must match for step to pass'
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FilterConditionDto)
  conditions: FilterConditionDto[];
}

export class TransformStepDto {
  @ApiProperty({ example: 'transform', description: 'Step type' })
  @IsString()
  @IsIn(['transform'])
  type: string;

  @ApiProperty({ 
    type: [TransformOperationDto],
    description: 'Array of transform operations to apply sequentially'
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransformOperationDto)
  ops: TransformOperationDto[];
}

export class HttpRequestStepDto {
  @ApiProperty({ example: 'http_request', description: 'Step type' })
  @IsString()
  @IsIn(['http_request'])
  type: string;

  @ApiProperty({ 
    example: 'POST', 
    enum: ['GET', 'POST'],
    description: 'HTTP method' 
  })
  @IsString()
  @IsIn(['GET', 'POST'])
  method: string;

  @ApiProperty({ 
    example: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
    description: 'Target URL - supports template variables like {{variable}}' 
  })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiProperty({ 
    example: { 'Content-Type': 'application/json', 'X-Api-Key': '{{api_key}}' },
    description: 'HTTP headers - supports template variables',
    required: false 
  })
  @IsObject()
  @IsOptional()
  headers?: Record<string, string>;

  @ApiProperty({ 
    type: HttpRequestBodyDto,
    description: 'Request body configuration' 
  })
  @ValidateNested()
  @Type(() => HttpRequestBodyDto)
  body: HttpRequestBodyDto;

  @ApiProperty({ 
    example: 5000,
    description: 'Request timeout in milliseconds',
    default: 5000 
  })
  @IsOptional()
  timeoutMs?: number;

  @ApiProperty({ 
    example: 3,
    description: 'Number of retry attempts on failure',
    default: 3 
  })
  @IsOptional()
  retries?: number;
}

// Union type for all step types
export type WorkflowStepDto = FilterStepDto | TransformStepDto | HttpRequestStepDto;

export class CreateWorkflowDto {
  @ApiProperty({ 
    example: 'User Signup Notification',
    description: 'Workflow name',
    minLength: 3,
    maxLength: 100 
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiProperty({ 
    example: 'Sends a Slack notification when a user signs up',
    description: 'Workflow description',
    required: false,
    maxLength: 500 
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ 
    example: true,
    description: 'Whether the workflow is enabled',
    default: true 
  })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiProperty({ 
    type: HttpTriggerDto,
    description: 'Workflow trigger configuration' 
  })
  @ValidateNested()
  @Type(() => HttpTriggerDto)
  trigger: HttpTriggerDto;

  @ApiProperty({ 
    type: 'array',
    description: 'Ordered array of workflow steps',
    items: {
      oneOf: [
        { $ref: '#/components/schemas/FilterStepDto' },
        { $ref: '#/components/schemas/TransformStepDto' },
        { $ref: '#/components/schemas/HttpRequestStepDto' },
      ],
    },
    example: [
      {
        type: 'filter',
        conditions: [
          { path: 'event_type', op: 'eq', value: 'user.signup' }
        ]
      },
      {
        type: 'transform',
        ops: [
          { op: 'template', to: 'message', template: 'New user: {{user.email}}' }
        ]
      },
      {
        type: 'http_request',
        method: 'POST',
        url: 'https://hooks.slack.com/services/XXX',
        body: { mode: 'custom', value: { text: '{{message}}' } },
        timeoutMs: 5000,
        retries: 3
      }
    ]
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => Object, {
    discriminator: {
      property: 'type',
      subTypes: [
        { value: FilterStepDto, name: 'filter' },
        { value: TransformStepDto, name: 'transform' },
        { value: HttpRequestStepDto, name: 'http_request' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  steps: WorkflowStepDto[];
}
