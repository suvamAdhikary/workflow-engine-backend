import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  url: process.env.APP_URL || 'http://localhost:3000',
  apiPrefix: process.env.API_PREFIX || 'api',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],

  // Rate limiting
  rateLimitTtl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10),
  rateLimitLimit: parseInt(process.env.RATE_LIMIT_LIMIT || '100', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Security
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),

  // External services
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,

  // Features
  enableSwagger: process.env.ENABLE_SWAGGER === 'true',
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
}));

export default appConfig;
