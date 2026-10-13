import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { CacheService } from './cache.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get('REDIS_URL');

        if (redisUrl) {
          return new Redis(redisUrl, {
            connectTimeout: 10000,
            lazyConnect: true,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
          });
        }

        return new Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          connectTimeout: 10000,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
        });
      },
      inject: [ConfigService],
    },
    CacheService,
  ],
  exports: ['REDIS_CLIENT', CacheService],
})
export class CacheModule {}
