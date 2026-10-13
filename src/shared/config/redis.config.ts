import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL,
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,

  // Connection settings
  connectTimeout: 10000,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxLoadingTimeout: 5000,

  // Key prefixes for different data types
  keyPrefixes: {
    refreshToken: 'refresh_token:',
    userSession: 'session:',
    workflow: 'workflow:',
    triggerPath: 'trigger:',
    rateLimit: 'rate_limit:',
    dataLoader: 'dataloader:',
    apiCache: 'api_cache:',
  },

  // TTL settings (in seconds)
  ttl: {
    refreshToken: 7 * 24 * 60 * 60, // 7 days
    userSession: 24 * 60 * 60, // 24 hours
    workflow: 60 * 60, // 1 hour
    triggerPath: 6 * 60 * 60, // 6 hours
    rateLimit: 60, // 1 minute
    dataLoader: 30, // 30 seconds
    apiCache: 5 * 60, // 5 minutes
  },
}));

export default redisConfig;
