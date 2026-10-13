import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';

async function bootstrap() {
  // Create Winston logger
  const logger = WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
            return `${timestamp} [${context || 'Application'}] ${level}: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta) : ''
            }`;
          }),
        ),
      }),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }),
    ],
  });

  const app = await NestFactory.create(AppModule, {
    logger,
  });

  const configService = app.get(ConfigService);
  const port = configService.get('PORT', 3000);
  const apiPrefix = configService.get('API_PREFIX', 'api');
  const nodeEnv = configService.get('NODE_ENV', 'development');

  // Security middleware
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // Request size limits
  app.use(json({ limit: '1mb' })); // 1MB limit for JSON payloads
  app.use(urlencoded({ extended: true, limit: '1mb' })); // 1MB limit for URL-encoded data

  // Global prefix (exclude webhook routes)
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['/t/:triggerPath'],
  });

  // CORS configuration
  const corsOrigins = configService.get('CORS_ORIGINS', 'http://localhost:5173').split(',');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: nodeEnv === 'production',
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger documentation
  if (configService.get('ENABLE_SWAGGER', true)) {
    const config = new DocumentBuilder()
      .setTitle('Workflow Engine API')
      .setDescription(
        `
        A comprehensive workflow automation platform API that enables users to create, 
        manage, and execute multi-step workflows triggered by HTTP webhooks.
        
        ## Features
        - JWT Authentication with refresh tokens
        - Workflow CRUD operations with validation
        - Real-time workflow execution via webhooks
        - Step processors (Filter, Transform, HTTP Request)
        - Run history and analytics
        - Rate limiting and caching
        - Comprehensive error handling
        
        ## Getting Started
        1. Register a new account or login to get access tokens
        2. Create your first workflow using the POST /workflows endpoint
        3. Use the generated trigger URL to execute workflows via webhooks
        4. Monitor execution history and results via the runs endpoints
        
        ## Authentication
        This API uses JWT tokens for authentication. Include the access token in the Authorization header:
        \`Authorization: Bearer <your-access-token>\`
        
        Access tokens expire in 15 minutes. Use the refresh token to get new access tokens.
      `,
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT access token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Authentication', 'User authentication and session management')
      .addTag('Workflows', 'Workflow CRUD operations and management')
      .addTag('Execution', 'Workflow execution via webhooks')
      .addTag('Runs', 'Workflow run history and analytics')
      .addTag('Health', 'Health check and system status')
      .addServer(`http://localhost:${port}`, 'Development server')
      .addServer('https://workflow-engine-api.onrender.com', 'Production server')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    });

    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        docExpansion: 'none',
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
      },
      customSiteTitle: 'Workflow Engine API Documentation',
      customfavIcon: '/favicon.ico',
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
      ],
      customCssUrl: ['https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css'],
    });

    logger.log(`📚 Swagger documentation available at: http://localhost:${port}/${apiPrefix}/docs`);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/${apiPrefix}/docs`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
  logger.log(`🔧 API Prefix: /${apiPrefix}`);
  logger.log(`🌐 CORS Origins: ${corsOrigins.join(', ')}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
