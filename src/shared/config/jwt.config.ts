import { registerAs } from '@nestjs/config';

export const jwtConfig = registerAs('jwt', () => ({
  accessSecret:
    process.env.JWT_ACCESS_SECRET || 'your-super-secret-jwt-access-key-change-in-production',
  refreshSecret:
    process.env.JWT_REFRESH_SECRET || 'your-super-secret-jwt-refresh-key-change-in-production',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Token validation settings
  ignoreExpiration: false,
  clockTolerance: 0,

  // Issuer and audience (for additional security)
  issuer: 'workflow-engine-api',
  audience: 'workflow-engine-client',
}));

export default jwtConfig;
