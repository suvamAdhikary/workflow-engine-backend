# Logging System Documentation

## 🎯 Overview

The Workflow Engine backend implements a comprehensive, production-ready logging system with structured logging, log collection, and monitoring capabilities. The system provides proper log levels, performance tracking, security event logging, and centralized log management.

## 🏗️ Architecture

### Core Components

1. **LoggingService** - Main logging service with structured logging
2. **LogCollectorService** - Collects and manages important logs
3. **LoggingInterceptor** - HTTP request/response logging
4. **LogsController** - Admin endpoints for log monitoring

### Log Levels

```typescript
enum LogLevel {
  ERROR = 'error',    // System errors, exceptions
  WARN = 'warn',      // Warnings, potential issues
  INFO = 'info',      // General information, business events
  DEBUG = 'debug',    // Detailed debugging information
  VERBOSE = 'verbose' // Very detailed tracing
}
```

## 📝 Usage Examples

### Basic Logging

```typescript
import { LoggingService } from '../shared/logging/logging.service';

@Injectable()
export class MyService {
  constructor(private readonly loggingService: LoggingService) {
    this.loggingService.setContext(MyService.name);
  }

  async myMethod(data: any) {
    // Method start logging
    this.loggingService.logMethodStart('myMethod', { data });

    try {
      // Info logging
      this.loggingService.info('Processing data', 'MyService', { 
        recordCount: data.length 
      });

      // Debug logging
      this.loggingService.debug('Validation passed', 'MyService', { 
        validationRules: ['required', 'format'] 
      });

      const result = await this.processData(data);

      // Method end logging
      this.loggingService.logMethodEnd('myMethod', { resultCount: result.length });

      return result;
    } catch (error) {
      // Error logging
      this.loggingService.logMethodError('myMethod', error, { data });
      throw error;
    }
  }
}
```

### Specialized Logging Methods

```typescript
// Database operations
this.loggingService.logDatabaseOperation('SELECT', 'users', duration, { userId });

// Cache operations
this.loggingService.logCacheOperation('GET', 'user:123', true, duration);

// HTTP requests
this.loggingService.logHttpRequest('POST', '/api/users', 201, duration, { userId });

// External API calls
this.loggingService.logExternalApiCall(
  'slack', 'POST', 'https://hooks.slack.com/...', 200, duration
);

// Workflow events
this.loggingService.logWorkflowEvent(
  'completed', workflowId, runId, { stepCount: 3, duration }
);

// Security events
this.loggingService.logSecurityEvent('login', userId, { ip, userAgent });

// Performance metrics
this.loggingService.logPerformanceMetric('response_time', 250, 'ms', { endpoint });
```

### Log Collection for Important Events

```typescript
import { LogCollectorService } from '../shared/logging/log-collector.service';

@Injectable()
export class MyService {
  constructor(
    private readonly loggingService: LoggingService,
    private readonly logCollectorService: LogCollectorService,
  ) {}

  async criticalOperation() {
    try {
      // ... operation logic
    } catch (error) {
      // Collect critical error
      this.logCollectorService.collectErrorLog(
        error, 
        'MyService', 
        { operation: 'criticalOperation' },
        'critical'
      );
      throw error;
    }
  }

  async securitySensitiveOperation(userId: string, ip: string) {
    // Collect security event
    this.logCollectorService.collectSecurityLog(
      'sensitive_operation_accessed',
      userId,
      ip,
      userAgent,
      { operation: 'securitySensitiveOperation' }
    );
  }

  async slowOperation() {
    const startTime = Date.now();
    
    // ... operation logic
    
    const duration = Date.now() - startTime;
    
    // Collect performance log if slow
    this.logCollectorService.collectPerformanceLog(
      'slowOperation',
      duration,
      1000, // threshold: 1 second
      { additionalContext: 'value' }
    );
  }
}
```

## 🔧 Configuration

### Environment Variables

```env
# Log level (error, warn, info, debug, verbose)
LOG_LEVEL=info

# Log collection intervals
LOG_METRICS_INTERVAL=60000      # 1 minute
LOG_CLEANUP_INTERVAL=3600000    # 1 hour
LOG_MAX_AGE_HOURS=24           # 24 hours
```

### Winston Configuration

The logging system uses Winston with different configurations for development and production:

**Development:**
- Console output with colors
- Detailed formatting
- All log levels enabled

**Production:**
- JSON formatting
- File rotation (10MB max, 5 error files, 10 combined files)
- Structured logging
- Performance optimized

## 📊 Log Structure

### Standard Log Format

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "User login successful",
  "context": "AuthService",
  "correlationId": "req_123456789",
  "metadata": {
    "userId": "user_123",
    "email": "user@example.com",
    "duration": 250,
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
  }
}
```

### Important Log Format

```json
{
  "id": "log_1642234567890_abc123def",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "error",
  "message": "Database connection failed",
  "context": "DatabaseService",
  "metadata": {
    "error": "Connection timeout",
    "host": "localhost",
    "port": 5432,
    "duration": 5000
  },
  "tags": ["database", "connection", "error"],
  "severity": "critical"
}
```

## 🔍 Monitoring & Analytics

### Admin Endpoints

#### Get Log Metrics
```bash
GET /api/health/logs/metrics
Authorization: Bearer <admin-token>
```

Response:
```json
{
  "success": true,
  "data": {
    "totalLogs": 1500,
    "errorCount": 25,
    "warnCount": 100,
    "infoCount": 1200,
    "debugCount": 175,
    "averageResponseTime": 250,
    "slowQueries": 5,
    "failedRequests": 15,
    "securityEvents": 8
  }
}
```

#### Get Important Logs
```bash
GET /api/health/logs/important?level=error&severity=critical&limit=50
Authorization: Bearer <admin-token>
```

#### Get Log Summary
```bash
GET /api/health/logs/summary
Authorization: Bearer <admin-token>
```

### Log Categories

1. **Security Logs**
   - Login/logout events
   - Failed authentication attempts
   - API key usage
   - Unauthorized access attempts

2. **Performance Logs**
   - Slow database queries
   - Long-running requests
   - Cache hit/miss ratios
   - External API response times

3. **Error Logs**
   - Application exceptions
   - Database connection failures
   - External service failures
   - Validation errors

4. **Business Logs**
   - Workflow executions
   - User registrations
   - Data processing events
   - System state changes

## 🚨 Alerting & Notifications

### Critical Log Handling

Critical logs (severity: 'critical') are:
- Immediately logged with ERROR level
- Stored in the important logs collection
- Can trigger external notifications (implement in LogCollectorService.exportLogs())

### Integration Points

The system is designed to integrate with external monitoring services:

```typescript
// In LogCollectorService.exportLogs()
private async exportLogs(): Promise<void> {
  const summary = this.getLogSummary();
  
  // Send to external services
  // - Elasticsearch/ELK Stack
  // - AWS CloudWatch
  // - Datadog
  // - Custom monitoring service
  
  // Example: Send critical logs to Slack
  if (summary.criticalLogs.length > 0) {
    await this.sendSlackAlert(summary.criticalLogs);
  }
}
```

## 🛡️ Security & Privacy

### Data Sanitization

The logging system automatically sanitizes sensitive data:

```typescript
const sensitiveFields = [
  'password',
  'passwordHash', 
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'authorization',
  'cookie'
];
```

Sensitive fields are replaced with `[REDACTED]` in logs.

### Log Retention

- **Memory**: Important logs kept for 24 hours (configurable)
- **Files**: Production logs rotated (10MB max per file)
- **External**: Export to long-term storage systems

## 📈 Performance Considerations

### Async Logging

All logging operations are asynchronous to avoid blocking the main thread:

```typescript
// Non-blocking logging
this.loggingService.info('Message', 'Context', metadata);
// Execution continues immediately
```

### Log Levels in Production

Recommended production log levels:
- **Production**: `info` or `warn`
- **Staging**: `debug`
- **Development**: `debug` or `verbose`

### Memory Management

- Important logs limited to 1000 entries in memory
- Automatic cleanup of old logs
- Configurable retention periods

## 🔧 Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce `LOG_MAX_AGE_HOURS`
   - Increase `LOG_CLEANUP_INTERVAL`
   - Lower log level in production

2. **Missing Logs**
   - Check log level configuration
   - Verify context is set correctly
   - Ensure LoggingModule is imported

3. **Performance Impact**
   - Use appropriate log levels
   - Avoid logging large objects
   - Consider async logging patterns

### Debug Mode

Enable verbose logging for troubleshooting:

```env
LOG_LEVEL=verbose
```

This will show all logging operations including cache hits, database queries, and internal operations.

## 🚀 Best Practices

### Do's ✅

- **Use appropriate log levels**
  ```typescript
  this.loggingService.error('Critical system failure', error.stack);
  this.loggingService.warn('Deprecated API usage detected');
  this.loggingService.info('User registered successfully');
  this.loggingService.debug('Validation rules applied');
  ```

- **Include context and metadata**
  ```typescript
  this.loggingService.info('Order processed', 'OrderService', {
    orderId,
    userId,
    amount,
    duration: Date.now() - startTime
  });
  ```

- **Use structured logging**
  ```typescript
  // Good
  this.loggingService.info('Payment processed', 'PaymentService', {
    paymentId: 'pay_123',
    amount: 99.99,
    currency: 'USD'
  });
  
  // Avoid
  this.loggingService.info(`Payment pay_123 for $99.99 USD processed`);
  ```

- **Log method boundaries**
  ```typescript
  async processPayment(paymentData: PaymentData) {
    this.loggingService.logMethodStart('processPayment', { paymentId: paymentData.id });
    
    try {
      const result = await this.doProcessPayment(paymentData);
      this.loggingService.logMethodEnd('processPayment', { result: 'success' });
      return result;
    } catch (error) {
      this.loggingService.logMethodError('processPayment', error, paymentData);
      throw error;
    }
  }
  ```

### Don'ts ❌

- **Don't log sensitive data**
  ```typescript
  // Bad
  this.loggingService.info('User login', 'AuthService', { 
    password: user.password // ❌ Never log passwords
  });
  
  // Good
  this.loggingService.info('User login', 'AuthService', { 
    userId: user.id,
    email: user.email
  });
  ```

- **Don't use console.log**
  ```typescript
  // Bad
  console.log('Debug info'); // ❌ Use proper logging service
  
  // Good
  this.loggingService.debug('Debug info', 'MyService');
  ```

- **Don't log in loops without throttling**
  ```typescript
  // Bad
  items.forEach(item => {
    this.loggingService.info(`Processing item ${item.id}`); // ❌ Too verbose
  });
  
  // Good
  this.loggingService.info(`Processing ${items.length} items`, 'MyService');
  items.forEach(item => {
    // Process without logging each item
  });
  this.loggingService.info(`Completed processing ${items.length} items`, 'MyService');
  ```

## 📋 Checklist

When implementing logging in a new service:

- [ ] Import LoggingService and LogCollectorService
- [ ] Set context in constructor: `this.loggingService.setContext(ServiceName.name)`
- [ ] Add method start/end logging for important operations
- [ ] Use appropriate log levels (error, warn, info, debug)
- [ ] Include relevant metadata in log entries
- [ ] Collect important logs for critical operations
- [ ] Handle errors with proper error logging
- [ ] Sanitize sensitive data before logging
- [ ] Test logging in both development and production modes

---

This logging system provides comprehensive observability for the Workflow Engine, enabling effective monitoring, debugging, and performance analysis in production environments.