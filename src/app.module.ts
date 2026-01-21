import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

// Feature modules
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { WebhookModule } from './webhook/webhook.module';
import { ExecutionModule } from './execution/execution.module';
import { RunsModule } from './runs/runs.module';

// Shared modules
import { DatabaseModule } from './shared/database/database.module';
import { CacheModule } from './shared/cache/cache.module';
import { LoggingModule } from './shared/logging/logging.module';

// Configuration
import { databaseConfig } from './shared/config/database.config';
import { redisConfig } from './shared/config/redis.config';
import { jwtConfig } from './shared/config/jwt.config';
import { appConfig } from './shared/config/app.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig],
      envFilePath: ['.env.local', '.env'],
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Winston Logger
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        level: configService.get('LOG_LEVEL', 'info'),
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
                return `${timestamp} [${context || 'App'}] ${level}: ${message} ${
                  Object.keys(meta).length ? JSON.stringify(meta) : ''
                }`;
              }),
            ),
          }),
          ...(configService.get('NODE_ENV') === 'production'
            ? [
                new winston.transports.File({
                  filename: 'logs/error.log',
                  level: 'error',
                  format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json(),
                  ),
                }),
                new winston.transports.File({
                  filename: 'logs/combined.log',
                  format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json(),
                  ),
                }),
              ]
            : []),
        ],
      }),
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        host: configService.get('DATABASE_HOST'),
        port: configService.get('DATABASE_PORT'),
        username: configService.get('DATABASE_USERNAME'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/shared/database/migrations/*{.ts,.js}'],
        synchronize: true, // TODO: Use migrations in production after initial setup
        logging: configService.get('NODE_ENV') === 'development' ? ['query', 'error'] : ['error'],
        ssl: configService.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
        extra: {
          // Connection pool settings
          max: 20,
          min: 5,
          acquire: 60000,
          idle: 10000,
        },
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: 'short',
          ttl: configService.get('RATE_LIMIT_TTL', 60) * 1000, // Convert to milliseconds
          limit: configService.get('RATE_LIMIT_LIMIT', 100),
        },
        {
          name: 'medium',
          ttl: 60 * 60 * 1000, // 1 hour
          limit: 1000,
        },
        {
          name: 'long',
          ttl: 24 * 60 * 60 * 1000, // 24 hours
          limit: 10000,
        },
      ],
    }),

    // Shared modules
    LoggingModule,
    DatabaseModule,
    CacheModule,

    // Feature modules
    AuthModule,
    HealthModule,
    WorkflowsModule,
    WebhookModule,
    ExecutionModule,
    RunsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    // Log application startup information
    console.log('🚀 Workflow Engine Backend Starting...');
    console.log(`📊 Environment: ${this.configService.get('NODE_ENV')}`);
    console.log(`🗄️  Database: ${this.configService.get('DATABASE_HOST')}:${this.configService.get('DATABASE_PORT')}`);
    console.log(`🔴 Redis: ${this.configService.get('REDIS_HOST')}:${this.configService.get('REDIS_PORT')}`);
    console.log(`🔒 JWT Access Token TTL: ${this.configService.get('JWT_ACCESS_EXPIRES_IN')}`);
    console.log(`🔄 JWT Refresh Token TTL: ${this.configService.get('JWT_REFRESH_EXPIRES_IN')}`);
  }
}