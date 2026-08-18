# Multi-Tenant SaaS Backend

A production-style multi-tenant SaaS backend built with **NestJS + TypeScript**, where multiple
organisations (tenants) share the same application while their users and business data remain
strictly isolated.

Built for the *Multi-Tenant SaaS Backend* technical assessment.

## Tech Stack

| Concern            | Choice                                   |
|---------------------|-------------------------------------------|
| Framework           | NestJS (Express)                          |
| Language            | TypeScript                                |
| Database            | PostgreSQL + Prisma ORM                   |
| Cache / Rate limit  | Redis (ioredis)                           |
| Auth                | JWT (access + refresh, rotation) + Passport |
| Background jobs     | BullMQ (Redis-backed queue)               |
| Docs                | Swagger / OpenAPI (`@nestjs/swagger`)     |
| Testing             | Jest + Supertest                          |
| Containerisation    | Docker + Docker Compose                   |

## Quick Start

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env
docker compose up --build
```

This starts Postgres, Redis and the backend, running `prisma migrate deploy` automatically on
boot. The API is available at `http://localhost:3000/api/v1`, Swagger docs at
`http://localhost:3000/api/docs`.

### Option B — Local development

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis   # or point DATABASE_URL/REDIS_URL at your own instances
npm run prisma:migrate:dev
npm run start:dev
```

## Environment Variables

See [`.env.example`](.env.example). No real secrets are committed; `JWT_SECRET` and
`REFRESH_TOKEN_SECRET` **must** be overridden with strong random values outside local development.

## Architecture

```
Request → Helmet/CORS → ThrottlerGuard (rate limit) → JwtAuthGuard (authn) → RolesGuard (RBAC)
        → Controller → Service (tenant-scoped Prisma queries) → PostgreSQL / Redis
```

- **Controllers → Services → Data Access**: controllers only handle HTTP concerns (validation via
  DTOs, route wiring); business rules and persistence live in services.
- **Tenant context** is derived exclusively from the verified JWT payload
  (`src/common/utils/tenant.util.ts#requireTenantId`). No endpoint accepts a client-supplied
  `tenantId` — every tenant-scoped Prisma query is filtered with the tenant id taken from the
  authenticated user, never from the request body/query/params. See Section 12 of the spec
  ("do not blindly trust a client-supplied tenant ID").
- **Global guards** (`src/app.module.ts`): `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`, applied
  to every route unless explicitly marked `@Public()`.
- **Global exception filter** (`src/common/filters/http-exception.filter.ts`) normalises all error
  responses to `{ statusCode, error, message, path, timestamp }` and never leaks stack traces or
  raw Prisma errors.

### Module layout

```
src/
  auth/            registration, login, refresh, logout, JWT strategy
  tenants/         Platform Admin tenant CRUD + self-service "my tenant"
  users/           tenant-scoped user CRUD with role-based restrictions
  projects/        tenant-scoped project CRUD, Redis-cached
  tasks/           tenant-scoped task CRUD, Employee-restricted views
  audit-logs/      queryable audit trail per tenant
  cache/           Redis wrapper with tenant-namespaced keys
  jobs/            BullMQ queue + worker (invitation emails)
  common/          guards, decorators, filters, interceptors, pagination, DTOs
  prisma/          PrismaService (global)
```

## Multi-Tenancy Model

- **Registration is tenant provisioning**: `POST /api/v1/auth/register` creates a new `Tenant`
  *and* its first `TENANT_ADMIN` user in a single transaction (self-service SaaS signup). Further
  users are created by an authenticated Tenant Admin/Manager via `POST /api/v1/users`, never via
  `/auth/register` — this matches the spec's "Employees cannot create users / Managers cannot
  create Tenant Admins" rule, which only makes sense as an authenticated, in-tenant action.
- **Login and tenant disambiguation**: since a user's email is only unique *within* a tenant
  (`@@unique([tenantId, email])`), the same email could theoretically exist in more than one
  tenant. `POST /api/v1/auth/login` accepts an optional `tenantSlug`; if omitted and the email
  matches more than one tenant, the API returns `401` asking the caller to disambiguate.
- **Row-level isolation**: every tenant-owned table (`users`, `projects`, `tasks`, `audit_logs`)
  carries a `tenant_id` foreign key and index. All service-layer reads/writes filter by
  `tenant_id` derived from the JWT (never trusted from the client) — e.g.
  `prisma.project.findFirst({ where: { id, tenantId } })`. A cross-tenant lookup returns `404`
  (not `403`), so a Tenant B caller cannot even infer that a Tenant A resource exists.
- **PostgreSQL Row-Level Security** was intentionally left out (marked optional in the spec) in
  favour of a single, consistently-audited application-layer boundary (`requireTenantId`) — adding
  RLS on top is a natural next step and would use `current_setting('app.tenant_id')` set per
  request via `SET LOCAL` inside a Prisma `$transaction`.

## Roles & Permissions

| Role            | Scope              | Can do |
|------------------|---------------------|--------|
| `PLATFORM_ADMIN` | Whole platform, `tenantId = null` | Create/list/update/delete tenants (`/tenants`) |
| `TENANT_ADMIN`   | Own tenant          | Manage users, projects, tasks, audit logs in their tenant |
| `MANAGER`        | Own tenant          | Manage projects/tasks; manage **Employee** users only (cannot create/edit/delete Tenant Admins or fellow Managers) |
| `EMPLOYEE`       | Own tenant          | Read projects; see and update the **status** only of tasks assigned to them |

Enforced in two layers:
1. `@Roles(...)` + `RolesGuard` — coarse endpoint-level gate.
2. Service-level checks (e.g. `UsersService.assertCanManage`, `TasksService.assertUpdatePermissions`)
   for rules that depend on the *target* resource, not just the caller's role (a Manager may hit
   `PATCH /users/:id` on any id — the service rejects it if the target is a Tenant Admin).

## Caching (Redis)

Implemented on the Projects module as the reference implementation of the pattern (the same
`CacheService` applies to any tenant-scoped resource):

- Keys are tenant-namespaced: `tenant:{tenantId}:projects:list:{queryHash}` and
  `tenant:{tenantId}:projects:item:{id}` (`CacheService.tenantKey`).
- TTL: 60s.
- Invalidation: any write (create/update/delete) calls
  `cacheService.delByPrefix('tenant:{tenantId}:projects')`, which removes both the list and item
  cache entries for that tenant via a Redis `SCAN` + pipelined `DEL`.

## Rate Limiting

- Global default: 100 requests/minute/IP (`@nestjs/throttler`, configurable via `THROTTLE_*` env
  vars), backed by in-memory storage per instance.
- `POST /auth/login` is additionally throttled to 5 requests/minute via `@Throttle(...)` to slow
  down credential-stuffing attempts.

## Background Jobs

`POST /users` (creating a tenant user) enqueues a `send-invitation-email` job on a BullMQ queue
backed by Redis (`src/jobs`). A separate worker (`InvitationsProcessor`) consumes it with 3 retry
attempts and exponential backoff — demonstrating the API → create record → queue job → worker
flow requested in the spec. The actual email send is stubbed with a log line in place of a real
provider (SES/SendGrid).

## Audit Logging

Every sensitive action is recorded to the `audit_logs` table (`AuditLogsService.record`, fire-and
-forget so a logging failure never breaks the primary request): `USER_CREATED`, `USER_UPDATED`,
`USER_DELETED`, `PROJECT_CREATED/UPDATED/DELETED`, `TASK_CREATED/UPDATED/DELETED`,
`LOGIN_SUCCESS`, `LOGIN_FAILED`, `ROLE_CHANGED`, `TENANT_CREATED/UPDATED/DELETED` — each with
`tenantId`, `userId`, `action`, `resource`, `resourceId`, `ip` and `timestamp`. Queryable (paginated,
filterable by action) via `GET /api/v1/audit-logs`.

## Security

- Passwords hashed with bcrypt (12 salt rounds); password policy enforced via `class-validator`.
- Access tokens are short-lived JWTs (default 15m); refresh tokens are opaque-to-the-client JWTs
  whose `jti` is hashed (SHA-256) and stored server-side, enabling revocation and **rotation**
  (each refresh invalidates the token used and issues a new one).
- `JwtStrategy` re-fetches the user from the database on every request (not just trusting the
  token payload), so a deactivated user or suspended tenant is rejected immediately even with a
  still-valid access token.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` strips/rejects any unexpected
  body fields — a client cannot smuggle a `tenantId` or `role` field into a DTO that doesn't
  declare it.
- `helmet()` for secure headers, configurable CORS origin, and the global exception filter never
  leaks stack traces or raw database errors to the client.

## API Documentation

Swagger UI: `GET /api/docs` (bearer-auth enabled — click "Authorize" and paste an access token to
try protected endpoints interactively). Base path for all resource routes: `/api/v1`.

## Testing

```bash
npm test              # unit tests (mocked Prisma/Redis — no external services required)
docker compose up -d postgres redis
npm run prisma:migrate:dev
npm run test:e2e       # integration tests against a real Postgres + Redis
```

- **Unit tests** (`test/unit`): `AuthService`, `TenantsService`, `UsersService`, `ProjectsService`
  (cache read-through/invalidation) and `RolesGuard`, all with Prisma/Redis mocked.
- **Integration tests** (`test/integration`), run against a real database:
  - `auth.e2e-spec.ts`: register/login/refresh (with rotation)/logout, validation and
    invalid-credentials paths.
  - `tenant-isolation.e2e-spec.ts` — **the mandatory cross-tenant security test**: creates two
    tenants (A, B) and asserts Tenant B gets `404` (not a data leak) attempting to read, update,
    or delete Tenant A's project/task/user, and that Tenant A's project never appears in Tenant
    B's list results.

## Known Trade-offs / What I'd Add With More Time

- Multi-instance rate limiting currently uses `@nestjs/throttler`'s default in-memory store; a
  Redis-backed `ThrottlerStorage` implementation would be needed for horizontal scaling.
- No refresh-token-per-device tracking/UI (all sessions for a user share the same revocation
  table, `logout` without a token revokes *all* sessions).
- PostgreSQL Row-Level Security (spec section 13, optional) is not implemented — see "Multi-Tenancy
  Model" above for the intended approach.
