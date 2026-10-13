import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User, UserRole } from '../shared/entities/user.entity';
import { PasswordService } from './password.service';
import { CacheService } from '../shared/cache/cache.service';
import { LoggingService } from '../shared/logging/logging.service';
import { LogCollectorService } from '../shared/logging/log-collector.service';

// DTOs
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

// Response interfaces
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  tokens: AuthTokens;
}

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  roles: UserRole[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly loggingService: LoggingService,
    private readonly logCollectorService: LogCollectorService,
  ) {
    this.loggingService.setContext(AuthService.name);
  }

  /**
   * Register a new user
   */
  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const startTime = Date.now();
    this.loggingService.logMethodStart('register', { email: registerDto.email });

    try {
      // Check if user already exists
      const existingUser = await this.userRepository.findOne({
        where: { email: registerDto.email },
      });

      if (existingUser) {
        this.logCollectorService.collectSecurityLog(
          'registration_attempt_existing_email',
          undefined,
          undefined,
          undefined,
          { email: registerDto.email },
        );
        throw new ConflictException('User with this email already exists');
      }

      // Hash password
      const passwordHash = await this.passwordService.hashPassword(registerDto.password);

      // Create user
      const user = this.userRepository.create({
        email: registerDto.email,
        passwordHash,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        roles: [UserRole.USER],
        emailVerified: false, // In production, implement email verification
      });

      const savedUser = await this.userRepository.save(user);

      // Generate tokens
      const tokens = await this.generateTokens(savedUser);

      // Store refresh token in cache
      await this.cacheService.setRefreshToken(savedUser.id, tokens.refreshToken);

      // Update last login
      await this.updateLastLogin(savedUser.id);

      const duration = Date.now() - startTime;
      this.loggingService.logMethodEnd('register', { userId: savedUser.id }, duration);

      // Log security event
      this.logCollectorService.collectSecurityLog(
        'user_registered',
        savedUser.id,
        undefined,
        undefined,
        { email: savedUser.email, duration },
      );

      return {
        user: this.sanitizeUser(savedUser),
        tokens,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.logMethodError('register', error, { email: registerDto.email });
      this.logCollectorService.collectErrorLog(error, 'AuthService', {
        method: 'register',
        email: registerDto.email,
        duration,
      });
      throw error;
    }
  }

  /**
   * Login user with email and password
   */
  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const startTime = Date.now();
    this.loggingService.logMethodStart('login', { email: loginDto.email });

    try {
      // Validate user credentials
      const user = await this.validateUser(loginDto.email, loginDto.password);

      if (!user) {
        this.logCollectorService.collectSecurityLog(
          'failed_login',
          undefined,
          undefined,
          undefined,
          { email: loginDto.email, reason: 'invalid_credentials' },
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      // Generate tokens
      const tokens = await this.generateTokens(user);

      // Store refresh token in cache
      await this.cacheService.setRefreshToken(user.id, tokens.refreshToken);

      // Update last login
      await this.updateLastLogin(user.id);

      const duration = Date.now() - startTime;
      this.loggingService.logMethodEnd('login', { userId: user.id }, duration);

      // Log successful login
      this.logCollectorService.collectSecurityLog('login', user.id, undefined, undefined, {
        email: user.email,
        duration,
      });

      return {
        user: this.sanitizeUser(user),
        tokens,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.logMethodError('login', error, { email: loginDto.email });

      if (error instanceof UnauthorizedException) {
        this.logCollectorService.collectSecurityLog(
          'failed_login',
          undefined,
          undefined,
          undefined,
          { email: loginDto.email, error: error.message, duration },
        );
      } else {
        this.logCollectorService.collectErrorLog(error, 'AuthService', {
          method: 'login',
          email: loginDto.email,
          duration,
        });
      }
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthTokens> {
    const startTime = Date.now();
    this.loggingService.logMethodStart('refreshToken');

    try {
      // Verify refresh token
      const payload = await this.verifyRefreshToken(refreshTokenDto.refreshToken);

      // Get user
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        this.logCollectorService.collectSecurityLog(
          'token_refresh_failed',
          payload.sub,
          undefined,
          undefined,
          { reason: 'user_not_found' },
        );
        throw new UnauthorizedException('User not found');
      }

      // Check if refresh token exists in cache
      const cachedToken = await this.cacheService.getRefreshToken(user.id);
      if (!cachedToken || cachedToken !== refreshTokenDto.refreshToken) {
        this.logCollectorService.collectSecurityLog(
          'token_refresh_failed',
          user.id,
          undefined,
          undefined,
          { reason: 'invalid_refresh_token' },
        );
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      // Store new refresh token in cache
      await this.cacheService.setRefreshToken(user.id, tokens.refreshToken);

      const duration = Date.now() - startTime;
      this.loggingService.logMethodEnd('refreshToken', { userId: user.id }, duration);

      // Log successful token refresh
      this.logCollectorService.collectSecurityLog('token_refresh', user.id, undefined, undefined, {
        duration,
      });

      return tokens;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.logMethodError('refreshToken', error);

      if (error instanceof UnauthorizedException) {
        this.logCollectorService.collectSecurityLog(
          'token_refresh_failed',
          undefined,
          undefined,
          undefined,
          { error: error.message, duration },
        );
      } else {
        this.logCollectorService.collectErrorLog(error, 'AuthService', {
          method: 'refreshToken',
          duration,
        });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout user (invalidate refresh token)
   */
  async logout(userId: string): Promise<void> {
    const startTime = Date.now();
    this.loggingService.logMethodStart('logout', { userId });

    try {
      // Remove refresh token from cache
      await this.cacheService.deleteRefreshToken(userId);

      // Remove user session
      await this.cacheService.deleteUserSession(userId);

      const duration = Date.now() - startTime;
      this.loggingService.logMethodEnd('logout', { userId }, duration);

      // Log logout event
      this.logCollectorService.collectSecurityLog('logout', userId, undefined, undefined, {
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.logMethodError('logout', error, { userId });
      this.logCollectorService.collectErrorLog(error, 'AuthService', {
        method: 'logout',
        userId,
        duration,
      });
      throw error;
    }
  }

  /**
   * Validate user credentials
   */
  async validateUser(email: string, password: string): Promise<User | null> {
    const startTime = Date.now();

    try {
      const user = await this.userRepository.findOne({
        where: { email },
      });

      if (!user) {
        this.loggingService.debug('User not found during validation', 'AuthService', { email });
        return null;
      }

      const isPasswordValid = await this.passwordService.comparePasswords(
        password,
        user.passwordHash,
      );

      if (!isPasswordValid) {
        this.loggingService.debug('Invalid password during validation', 'AuthService', {
          userId: user.id,
          email,
        });
        return null;
      }

      const duration = Date.now() - startTime;
      this.loggingService.debug('User validation successful', 'AuthService', {
        userId: user.id,
        email,
        duration,
      });

      return user;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.error(
        `validateUser - Error: ${error.message}`,
        error.stack,
        'AuthService',
        {
          email,
          duration,
        },
      );
      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const startTime = Date.now();

    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      const duration = Date.now() - startTime;
      this.loggingService.logDatabaseOperation('SELECT', 'users', duration, { userId });

      return user;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.error(
        `getUserById - Error: ${error.message}`,
        error.stack,
        'AuthService',
        {
          userId,
          duration,
        },
      );
      return null;
    }
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    // Calculate expiration time in seconds
    const expiresIn = this.parseExpirationTime(
      this.configService.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    );

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Verify refresh token
   */
  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Update user's last login timestamp
   */
  private async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.userRepository.update(userId, {
        lastLoginAt: new Date(),
      });
    } catch (error) {
      this.loggingService.error(
        `updateLastLogin - Error: ${error.message}`,
        error.stack,
        'AuthService',
        {
          userId,
        },
      );
    }
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: User): any {
    const { passwordHash, ...sanitizedUser } = user;
    return {
      ...sanitizedUser,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
    };
  }

  /**
   * Parse expiration time string to seconds
   */
  private parseExpirationTime(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new BadRequestException('Invalid expiration time format');
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        throw new BadRequestException('Invalid expiration time unit');
    }
  }
}
