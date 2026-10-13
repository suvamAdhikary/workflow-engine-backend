# Workflow Engine Backend

[![CI](https://github.com/suvamAdhikary/workflow-engine-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/suvamAdhikary/workflow-engine-backend/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.3-E0234E.svg)](https://nestjs.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A production-ready NestJS backend for the Workflow Engine platform - a comprehensive workflow automation system similar to Zapier.

> **For recruiters / interviewers:** [Architecture overview (1 page)](docs/ARCHITECTURE.md) · [Roadmap](ROADMAP.md) · Live Swagger on deployed API

## Architecture Overview

```mermaid
graph TB
    Client[Client/Frontend<br/>workflow-engine-frontend]
    
    subgraph "Workflow Engine Backend"
        API[NestJS API<br/>:3000]
        Auth[Auth Module<br/>JWT + API Keys]
        Workflows[Workflows Module<br/>CRUD + Validation]
        Webhook[Webhook Module<br/>Public Triggers]
        Execution[Execution Service<br/>Step Pipeline]
        Runs[Runs Module<br/>History & Analytics]
        
        API --> Auth
        API --> Workflows
        API --> Webhook
        API --> Runs
        Webhook --> Execution
    end
    
    subgraph "Data Layer"
        Postgres[(PostgreSQL<br/>TypeORM)]
        Redis[(Redis<br/>Cache)]
    end
    
    subgraph "External"
        ExtAPI[External APIs<br/>Slack, Discord, etc.]
    end
    
    Client -->|REST API<br/>JWT Auth| API
    ThirdParty[Third Party<br/>Webhooks] -->|POST /t/:triggerPath| Webhook
    
    Auth --> Postgres
    Workflows --> Postgres
    Runs --> Postgres
    
    Workflows --> Redis
    Webhook --> Redis
    
    Execution -->|HTTP Request Steps| ExtAPI
    
    style API fill:#e0234e,color:#fff
    style Postgres fill:#336791,color:#fff
    style Redis fill:#dc382d,color:#fff
    style Execution fill:#68a063,color:#fff
```

## Quick Start

**One-command setup with Docker:**

```bash
docker compose up
```

Then open `http://localhost:3000/api/docs` for Swagger documentation.

**Manual setup** (requires Postgres + Redis):

```bash
cp env.example .env && npm install && npm run migration:run && npm run start:dev
```

## 🚀 Features

- **JWT Authentication** with refresh tokens
- **API Key Management** for external integrations
- **Workflow CRUD Operations** with validation
- **Real-time Webhook Execution** via unique trigger URLs
- **Step Processors** (Filter, Transform, HTTP Request)
- **Run History & Analytics** with detailed execution logs
- **Redis Caching** for performance optimization
- **Rate Limiting** and security middleware
- **Comprehensive API Documentation** with Swagger
- **Production-ready** with Docker support

## 🛠️ Tech Stack

- **Framework**: NestJS (Node.js, TypeScript)
- **Database**: PostgreSQL with TypeORM
- **Caching**: Redis
- **Authentication**: JWT with Passport
- **Validation**: class-validator
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest
- **Containerization**: Docker

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- npm 9+

## 🏃‍♂️ Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp env.example .env

# Update environment variables
nano .env
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

```bash
# Run migrations
npm run migration:run

# Seed initial data (optional)
npm run seed
```

### 4. Start Development Server

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`

## 🐳 Docker Development

Start all services (Postgres, Redis, and the backend) with one command:

```bash
docker compose up
```

The application will:
1. Start PostgreSQL and Redis
2. Wait for services to be healthy
3. Run database migrations automatically
4. Start the backend server on port 3000

Useful commands:

```bash
# Start in detached mode
docker compose up -d

# View logs
docker compose logs -f backend

# Stop services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

## 📚 API Documentation

Once the server is running, visit:
- **Swagger UI**: `http://localhost:3000/api/docs`
- **Health Check**: `http://localhost:3000/api/health`

## 🔐 Authentication

The API supports multiple authentication methods:

### JWT Tokens
```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}'

# Use access token
curl -H "Authorization: Bearer <access-token>" \
  http://localhost:3000/api/workflows
```

### API Keys
```bash
# Create API key (requires JWT auth)
curl -X POST http://localhost:3000/api/api-keys \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Integration Key"}'

# Use API key
curl -H "X-API-Key: <api-key>" \
  http://localhost:3000/api/workflows
```

## 🔄 Workflow System

### Creating a Workflow

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Slack Notification",
    "description": "Send alerts to Slack",
    "steps": [
      {
        "type": "filter",
        "conditions": [
          {"path": "event_type", "op": "eq", "value": "alert"}
        ]
      },
      {
        "type": "transform",
        "ops": [
          {"op": "template", "to": "message", "template": "Alert: {{event_type}}"}
        ]
      },
      {
        "type": "http_request",
        "method": "POST",
        "url": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
        "body": {"mode": "custom", "value": {"text": "{{message}}"}}
      }
    ]
  }'
```

### Triggering a Workflow

```bash
# Use the generated trigger URL
curl -X POST http://localhost:3000/t/<trigger-path> \
  -H "Content-Type: application/json" \
  -d '{"event_type":"alert","severity":"high"}'
```

## 📊 Available Scripts

```bash
# Development
npm run start:dev      # Start with hot reload
npm run start:debug    # Start with debugging

# Building
npm run build          # Build for production
npm run start:prod     # Start production build

# Testing
npm test              # Run unit tests
npm run test:watch    # Run tests in watch mode
npm run test:cov      # Run tests with coverage
npm run test:e2e      # Run end-to-end tests

# Database
npm run migration:generate  # Generate migration
npm run migration:run      # Run migrations
npm run migration:revert   # Revert last migration
npm run seed              # Run database seeds

# Code Quality
npm run lint          # Run ESLint
npm run format        # Format code with Prettier

# Utilities
npm run generate-postman  # Generate Postman collection
```

## 🏗️ Project Structure

```
src/
├── auth/                 # Authentication module
│   ├── decorators/      # Custom decorators
│   ├── dto/            # Data transfer objects
│   ├── guards/         # Auth guards
│   └── strategies/     # Passport strategies
├── shared/              # Shared modules
│   ├── cache/          # Redis cache service
│   ├── config/         # Configuration files
│   ├── database/       # Database module
│   ├── entities/       # TypeORM entities
│   ├── filters/        # Exception filters
│   └── interceptors/   # Request/response interceptors
├── workflows/           # Workflow management
├── webhook/            # Webhook execution
├── health/             # Health check
├── app.module.ts       # Root module
└── main.ts            # Application entry point
```

## 🔧 Configuration

Key environment variables:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/workflow_engine

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_ACCESS_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Application
NODE_ENV=development
PORT=3000
API_PREFIX=api

# External Services
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## 🧪 Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📈 Performance & Monitoring

- **Redis Caching**: Workflow definitions, user sessions, rate limiting
- **Database Indexing**: Optimized queries for workflows and runs
- **Request Logging**: Comprehensive request/response logging
- **Health Checks**: Built-in health monitoring endpoints
- **Rate Limiting**: Configurable rate limits per user/IP

## 🚀 Deployment

### Docker Production Build

```bash
# Build production image
docker build -t workflow-engine-backend .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  workflow-engine-backend
```

### Environment-specific Configs

- **Development**: Hot reload, detailed logging, Swagger enabled
- **Production**: Optimized builds, error logging, security headers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the [docs](../docs/) folder
- **API Reference**: Visit `/api/docs` when running the server
- **Issues**: Create an issue on GitHub

## 📚 Related Projects

- **Frontend Repository**: [workflow-engine-frontend](https://github.com/suvamAdhikary/workflow-engine-frontend) - React/Vite UI for this workflow engine
- **API Collection**: [`Workflow-Engine-API.postman_collection.json`](Workflow-Engine-API.postman_collection.json) in this repository

---

Built with ❤️ using NestJS and TypeScript