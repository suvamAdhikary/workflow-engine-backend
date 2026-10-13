# Workflow Engine Backend - Roadmap

**Last Updated**: 2026-10-13

This roadmap outlines the development progress and future plans for the Workflow Engine Backend project.

---

## ✅ Done

### Core Features
- **Authentication System** - JWT-based auth with access/refresh tokens, bcrypt password hashing
- **API Key Management** - Server-to-server authentication for external integrations
- **Workflow CRUD** - Complete workflow lifecycle management with validation
- **Public Webhook Triggers** - Unique trigger URLs (`/t/:triggerPath`) for each workflow
- **Step Execution Engine** - Sequential step processing with context passing
- **Step Processors**:
  - Filter - Conditional execution based on context data
  - Transform - Data transformation (template, pick, default operations)
  - HTTP Request - Outbound API calls with templated payloads
- **Run History** - Complete execution logs with input/output context
- **Redis Caching** - Performance optimization for workflow lookups
- **Request Deduplication** - Prevent duplicate webhook triggers
- **Rate Limiting** - Global and per-route throttling
- **Security Hardening** - Helmet, CORS, input validation, payload size limits
- **Swagger Documentation** - Interactive API docs at `/api/docs`
- **Health Checks** - Monitoring endpoints for liveness/readiness
- **Production Logging** - Winston structured logging with file/console transports
- **TypeORM Migrations** - Database schema version control
- **E2E Test Suite** - Comprehensive workflow and auth testing
- **Unit Tests** - Step processor and service tests
- **Docker Support** - Production-ready Dockerfile with multi-stage builds
- **GitHub Actions CI** - Automated linting, testing, and build verification

### DevOps & Infrastructure
- **Docker Compose** - One-command local development setup
- **Environment Configuration** - Comprehensive `.env.example` with all required variables
- **Database Seeding** - Initial data setup utilities

### Documentation
- **Architecture Guide** - High-level system design documentation
- **API Documentation** - Swagger/OpenAPI with detailed endpoint descriptions
- **Deployment Guide** - Instructions for Render, Vercel, and Docker deployments
- **Logging Guide** - Structured logging best practices

---

## 🚧 In Progress

### Testing & Quality
- **Improved Test Coverage** - Expanding unit test coverage for edge cases
- **Integration Test Enhancements** - More comprehensive webhook execution tests

---

## 📋 Next (High Priority)

### Performance & Scalability
- **Asynchronous Workflow Execution** - Queue-based execution using Bull/BullMQ
  - *Decision rationale*: Current synchronous execution blocks HTTP responses; queueing enables long-running workflows, retry logic, and horizontal scaling
  - *Dependencies*: Bull library, separate worker processes
  
- **Workflow Execution Timeout Configuration** - Per-workflow timeout settings
  - *Current state*: Hardcoded 30-second timeout in webhook service
  - *Goal*: User-configurable timeouts via workflow settings

### Step Processors (Extensions)
- **Delay/Wait Step** - Pause workflow execution for specified duration
- **Conditional Branching** - If/else logic within workflows
- **Loop/Iterator Step** - Process arrays/lists with repeated operations
- **Data Storage Step** - Persist workflow data to database for cross-execution state

### Monitoring & Observability
- **OpenTelemetry Integration** - Distributed tracing for execution flows
- **Metrics Endpoints** - Prometheus-compatible metrics (execution times, success rates)
- **Alerting System** - Notify users of workflow failures via email/webhooks

### Developer Experience
- **Workflow Templates** - Pre-built workflow examples (Slack notification, email automation, etc.)
- **Step Validation on Save** - Catch configuration errors before execution
- **Dry Run Mode** - Test workflows without side effects

---

## 🔮 Later (Lower Priority)

### Advanced Features
- **Workflow Versioning** - Track and rollback workflow changes
- **Scheduled Triggers** - Cron-based workflow execution (not just webhooks)
- **Workflow Dependencies** - Chain workflows together (one triggers another)
- **User Roles & Permissions** - Team collaboration with RBAC
- **Workflow Sharing** - Public/private workflow templates

### Integrations
- **Pre-built Connectors** - Native integrations with popular APIs (GitHub, Google Sheets, Stripe, etc.)
- **OAuth Flow Support** - Managed auth for third-party APIs
- **Webhook Secret Validation** - HMAC signature verification for incoming webhooks

### Performance Optimizations
- **Workflow Step Parallelization** - Execute independent steps concurrently
- **Context Data Compression** - Reduce storage footprint for large payloads
- **Database Query Optimization** - Indexed queries, read replicas

### Infrastructure
- **Multi-region Deployment** - Geo-distributed API endpoints
- **Kubernetes Manifests** - Helm charts for container orchestration
- **Auto-scaling Configuration** - Load-based horizontal pod autoscaling

### Developer Tools
- **GraphQL API** - Alternative to REST for flexible querying
- **Workflow SDK** - Client libraries for programmatic workflow management (Node.js, Python, Go)
- **CLI Tool** - Command-line interface for workflow deployment and management

---

## 🛠️ Technical Debt & Maintenance

### Code Quality
- **Refactor Context Manager** - Simplify context cloning/merging logic
- **Error Handling Consistency** - Standardize error codes across modules
- **Type Safety Improvements** - Remove `any` types, strengthen TypeScript strict mode

### Security
- **API Key Rotation** - Automated key expiry and renewal
- **Audit Logging** - Immutable logs for compliance (who did what, when)
- **Secret Management** - Integration with HashiCorp Vault or AWS Secrets Manager

---

## 🗓️ Key Decisions & Rationale

| Decision | Date | Reasoning |
|----------|------|-----------|
| Synchronous execution (MVP) | Initial release | Simplicity for first version; sufficient for short workflows |
| Public webhooks without auth | Initial release | Enable third-party systems to trigger workflows; security via unguessable paths + rate limits |
| PostgreSQL for workflows | Initial release | Relational model fits audit requirements; JSON columns for flexible step definitions |
| Redis for caching | Initial release | Reduce DB load for frequent workflow lookups during triggers |
| TypeORM over Prisma | Initial release | Mature migration system; decorator-based entities align with NestJS patterns |
| Bull for async execution (planned) | 2026-10-13 | Industry-standard queue; Redis-backed; built-in retry and failure handling |

---

## 📊 Metrics & Goals

*Note: Metrics will be tracked once monitoring infrastructure is in place.*

### Performance Targets (Future)
- Webhook response time: < 200ms (after queueing)
- Workflow execution time: Configurable, 30s default
- Database query time: < 50ms (p95)
- Cache hit rate: > 80% for workflow lookups

### Reliability Targets (Future)
- Uptime: 99.9% (excluding planned maintenance)
- Failed execution rate: < 1%
- Queue processing lag: < 5 seconds

---

**Contributing**: See the main [README](README.md) for contribution guidelines. For feature requests or architectural discussions, open a GitHub issue.
