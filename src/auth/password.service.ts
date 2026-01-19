import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LoggingService } from '../shared/logging/logging.service';

@Injectable()
export class PasswordService {
  private readonly saltRounds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: LoggingService,
  ) {
    this.saltRounds = this.configService.get('BCRYPT_SALT_ROUNDS', 12);
    this.loggingService.setContext(PasswordService.name);
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const startTime = Date.now();
    this.loggingService.debug('hashPassword - Started');

    try {
      const hashedPassword = await bcrypt.hash(password, this.saltRounds);
      const duration = Date.now() - startTime;
      
      this.loggingService.debug('hashPassword - Completed: Password hashed successfully', 'PasswordService', {
        saltRounds: this.saltRounds,
        duration,
      });
      
      return hashedPassword;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.error(`hashPassword - Error: ${error.message}`, error.stack, 'PasswordService', {
        saltRounds: this.saltRounds,
        duration,
      });
      throw error;
    }
  }

  /**
   * Compare a plain password with a hashed password
   */
  async comparePasswords(plainPassword: string, hashedPassword: string): Promise<boolean> {
    const startTime = Date.now();
    this.loggingService.debug('comparePasswords - Started');

    try {
      const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
      const duration = Date.now() - startTime;
      
      this.loggingService.debug(`comparePasswords - Completed: Password match = ${isMatch}`, 'PasswordService', {
        duration,
      });
      
      return isMatch;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.loggingService.error(`comparePasswords - Error: ${error.message}`, error.stack, 'PasswordService', {
        duration,
      });
      return false;
    }
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Minimum length
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    // Maximum length
    if (password.length > 128) {
      errors.push('Password must be no more than 128 characters long');
    }

    // Must contain lowercase letter
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Must contain uppercase letter
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Must contain number
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Must contain special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Common password patterns to avoid
    const commonPatterns = [
      /password/i,
      /123456/,
      /qwerty/i,
      /admin/i,
      /letmein/i,
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password contains common patterns that are not allowed');
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate a random password
   */
  generateRandomPassword(length: number = 16): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = lowercase + uppercase + numbers + symbols;
    
    let password = '';
    
    // Ensure at least one character from each category
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}