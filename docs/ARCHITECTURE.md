# Workflow Engine — architecture (1-page)

NestJS backend for a Zapier-style automation product: users define **workflows** (steps), trigger them via **public webhook URLs**, and inspect **runs**. Built as a portfolio/production-style service (JWT, API keys, Redis, Postgres, rate limits).

**Live API (example):** `https://workflow-engine-backend.onrender.com` · **Swagger:** `/api/docs`

---

## System context

```
                    ┌─────────────────┐
  Browser / Client  │  workflow-engine │  JWT / API key
        ───────────►│    frontend      │──────────────┐
                    └────────┬────────┘              │
                             │ REST                   ▼
                    ┌────────▼──────────────────────────────┐
                    │     Workflow Engine API (NestJS)       │
                    │  /api/*  auth · workflows · runs       │
                    │  /t/:triggerPath  public webhooks      │
                    └─┬────────────┬──────────────┬─────────┘
                      │            │              │
                 PostgreSQL      Redis         External HTTP
                 (TypeORM)      (cache)      (http_request steps)
```

---

## NestJS modules

| Module | Responsibility |
|--------|----------------|
| **AuthModule** | Register/login, JWT access + refresh (Passport), API keys |
| **WorkflowsModule** | CRUD workflows, validation, per-workflow trigger path |
| **WebhookModule** | `POST /t/:triggerPath` — public, throttled triggers |
| **ExecutionModule** | Step pipeline: filter → transform → http_request |
| **RunsModule** | Persist run status, context, errors for history |
| **HealthModule** | Health + operational logs endpoints |
| **CacheModule** | Redis caching for hot reads |
| **LoggingModule** | Winston structured logs |

Global: `ValidationPipe`, `HttpExceptionFilter`, `ThrottlerModule`, Helmet, CORS, Swagger.

---

## Request paths

| Path | Auth | Purpose |
|------|------|---------|
| `/api/auth/*` | Public (register/login) | Tokens |
| `/api/workflows`, `/api/runs`, `/api/api-keys` | JWT or `X-API-Key` | Product API |
| `/api/health` | Public | Liveness |
| `/t/:triggerPath` | **Public** (no JWT) | Execute workflow; rate-limited |

Webhook routes are **excluded** from the global `/api` prefix so trigger URLs stay short and stable.

---

## Execution flow (webhook trigger)

1. **WebhookController** receives JSON body → initial **context** (`ctx`).
2. **WebhookService** loads workflow by `triggerPath`; rejects if disabled (403).
3. Creates **WorkflowRun** row (status `running`).
4. **ExecutionService** runs steps **sequentially**:
   - **filter** — conditions on `ctx`; can short-circuit (`skipped`).
   - **transform** — template/pick/default ops on `ctx`.
   - **http_request** — outbound HTTP with templated body/headers.
5. **ContextManager** clones/merges context between steps.
6. Run updated to `success` | `failed` | `skipped`; logs via **LoggingService**.

Step processors implement a shared `IStepProcessor` interface (easy to add new step types).

---

## Data model (Postgres)

| Entity | Role |
|--------|------|
| **User** | Account |
| **ApiKey** | Hashed keys for integrations |
| **Workflow** | Name, enabled flag, steps JSON, unique `triggerPath` |
| **WorkflowRun** | Per execution: status, context snapshot, timing, errors |

TypeORM entities under `src/shared/entities/`. Migrations in `src/shared/database/migrations/`.

---

## Security & reliability

- **JWT** — short-lived access + refresh; issuer/audience configured in `jwt.config.ts`.
- **API keys** — for server-to-server workflow management.
- **Rate limiting** — global throttler + stricter limits on `/t/*` webhooks.
- **Input** — DTO validation (`class-validator`), payload size limits (1MB), sanitization utilities.
- **Errors** — centralized filter; consistent API response shape (`TransformInterceptor`).

---

## Observability

- Winston console + file transports (`logs/combined.log`, `logs/error.log`).
- Request logging interceptor; execution logs include `workflowId` / `runId`.

---

## Run locally (minimal)

```bash
cp env.example .env   # set DATABASE_* and REDIS_*
npm install
npm run migration:run
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`

See root **README.md** for auth curl examples and **DEPLOYMENT-GUIDE.md** for Render/Vercel.

---

## Design choices (interview talking points)

- **Public webhooks vs authenticated API** — triggers must work from third-party systems without sharing user JWTs; security = unguessable path + throttle + disable switch.
- **Synchronous execution** — simple for MVP; production evolution would queue runs (Bull/Kafka) for slow HTTP steps.
- **Step processor map** — open-closed: new step types without changing orchestrator core.
- **Postgres for workflow definitions** — JSON steps column + relational runs for audit.

---

## Related repos

- **Frontend:** `workflow-engine-frontend` (Vite/React) — talks to this API.
- **Postman:** `Workflow-Engine-API.postman_collection.json` at repo root.
