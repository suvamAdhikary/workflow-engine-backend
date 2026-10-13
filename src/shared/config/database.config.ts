import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'workflow_user',
  password: process.env.DATABASE_PASSWORD || 'workflow_pass',
  database: process.env.DATABASE_NAME || 'workflow_engine',

  // Connection pool settings
  maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20', 10),
  minConnections: parseInt(process.env.DATABASE_MIN_CONNECTIONS || '5', 10),
  acquireTimeout: parseInt(process.env.DATABASE_ACQUIRE_TIMEOUT || '60000', 10),
  idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '10000', 10),

  // SSL settings
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,

  // Logging
  logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],

  // Schema synchronization (only for development)
  synchronize: process.env.NODE_ENV === 'development',
}));

export default databaseConfig;
