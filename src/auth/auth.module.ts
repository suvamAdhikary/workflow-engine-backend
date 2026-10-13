import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { User } from '../shared/entities/user.entity';
import { ApiKey } from '../shared/entities/api-key.entity';

// Services
import { AuthService } from './auth.service';
import { ApiKeyService } from './api-key.service';
import { PasswordService } from './password.service';

// Controllers
import { AuthController } from './auth.controller';
import { ApiKeyController } from './api-key.controller';

// Strategies
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { ApiKeyStrategy } from './strategies/api-key.strategy';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { RolesGuard } from './guards/roles.guard';

// Shared modules
import { CacheModule } from '../shared/cache/cache.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
          issuer: configService.get('jwt.issuer', 'workflow-engine-api'),
          audience: configService.get('jwt.audience', 'workflow-engine-client'),
        },
      }),
    }),
    TypeOrmModule.forFeature([User, ApiKey]),
    CacheModule,
  ],
  controllers: [AuthController, ApiKeyController],
  providers: [
    // Services
    AuthService,
    ApiKeyService,
    PasswordService,

    // Strategies
    JwtStrategy,
    LocalStrategy,
    ApiKeyStrategy,

    // Guards
    JwtAuthGuard,
    LocalAuthGuard,
    ApiKeyAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    ApiKeyService,
    PasswordService,
    JwtAuthGuard,
    LocalAuthGuard,
    ApiKeyAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
