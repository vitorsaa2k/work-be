# Work Backend

Backend foundation for **Work**, a local small-gig marketplace. Users will be able to publish
jobs, apply to jobs, select one worker, and coordinate the work.

This milestone provides the foundation and account lifecycle: validated configuration, Hono HTTP
infrastructure, PostgreSQL/Prisma, the initial domain schema, migrations, a development seed, public
gig discovery, self-service registration, secure server-side cookie sessions, email verification,
password reset, and authentication throttling. Gig creation, applications, worker selection,
messaging, reviews, and moderation are not implemented yet.

## Stack

- Node.js 24 (LTS) and npm
- TypeScript 5.9 in strict mode with ESM/NodeNext
- Hono 4 and `@hono/node-server`
- PostgreSQL
- Prisma ORM 7 with the `pg` driver adapter and `prisma-client` generator
- Zod 4 for environment and request validation
- Argon2id password hashing with `@node-rs/argon2`
- Opaque server-side sessions and one-time action tokens stored as SHA-256 hashes
- Email delivery through SMTP (`nodemailer`) or a local file outbox
- In-memory fixed-window throttling for authentication and account-recovery attempts
- Vitest 5 for unit, API, and database integration tests
- ESLint and Prettier

Prisma packages are pinned to the stable `7.10.1` release. The npm `latest` tag for the Prisma CLI
may point to a pre-release, so installs should use the pinned versions.

## Architecture

```text
prisma/
  schema.prisma          Domain schema and enums
  migrations/            Committed database migrations
  seed.ts                Idempotent development seed
src/
  app.ts                 Creates the Hono app without starting a server
  server.ts              Environment loading, startup, and graceful shutdown
  config/env.ts          Centralized, validated environment configuration
  db/prisma.ts           Reusable Prisma client factory with the PostgreSQL adapter
  lib/                   Errors, password hashing, error mapping, and structured logging
  middleware/            Request IDs, logs, CSRF checks, error handler, not-found handler
  modules/
    auth/                Registration, sessions, verification/reset tokens, mail, and throttling
    health/              Liveness/readiness service and routes
    gigs/                Public gig schemas, service, and routes
  routes/index.ts        Versioned API route composition
tests/
  unit/                  Pure validation, mapping, and logging tests
  integration/           Application and PostgreSQL-backed API tests
  setup/                 Test database guard and migration setup
  helpers/               Test app, fixtures, and database utilities
```

HTTP handling, business logic, database access, and configuration are kept separate. Services are
injected into `createApp`, which makes API tests possible without starting a network server or
creating a real database client.

## Prerequisites

- Node.js 24 or newer
- npm
- PostgreSQL running locally, or another PostgreSQL server reachable through `DATABASE_URL`

The project was verified against PostgreSQL 18.1.

## Installation

```bash
npm install
```

Copy the example environment file and replace the placeholder credentials:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

`.env` is ignored by Git. Never commit real credentials. Prisma 7 does not load `.env`
automatically, so the application, Prisma config, seed, and test setup load it explicitly with
`dotenv`.

## Environment variables

| Variable            | Required                  | Default                      | Description                                                              |
| ------------------- | ------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`          | No                        | `development`                | `development`, `test`, or `production`.                                  |
| `HOST`              | No                        | `127.0.0.1`                  | HTTP bind address. Use `0.0.0.0` in a container or deployed environment. |
| `PORT`              | No                        | `3000`                       | HTTP port from 1 to 65535.                                               |
| `DATABASE_URL`      | Yes                       | -                            | PostgreSQL connection URL.                                               |
| `TEST_DATABASE_URL` | For integration tests     | -                            | Dedicated test database. It must end in `_test` or `-test`.              |
| `FRONTEND_ORIGIN`   | In production             | `http://localhost:5173`      | Exact browser origin allowed by CORS. A wildcard is rejected.            |
| `LOG_LEVEL`         | No                        | `info`                       | `debug`, `info`, `warn`, or `error`.                                     |
| `TRUST_PROXY`       | No                        | `false`                      | Use the first `X-Forwarded-For` address for throttling.                  |
| `MAIL_DELIVERY`     | No                        | `file`                       | `file` writes `.eml` files; `smtp` sends through `SMTP_URL`.             |
| `MAIL_FROM`         | No                        | `Work <no-reply@work.local>` | Sender header used for account emails.                                   |
| `MAIL_OUTBOX_DIR`   | No                        | `.mail-outbox`               | Local directory for `file` delivery. It is gitignored.                   |
| `SMTP_URL`          | When `MAIL_DELIVERY=smtp` | -                            | `smtp://` or `smtps://` URL, including credentials when needed.          |

Production requires an explicit `FRONTEND_ORIGIN`. Configuration failures are logged with variable
paths and messages only; values and credentials are not logged.

Enable `TRUST_PROXY` only when the application is unreachable directly and the reverse proxy
overwrites or sanitizes `X-Forwarded-For`. Otherwise clients could spoof the address used for rate
limiting.

The default `file` mailer writes verification and password-reset messages to `MAIL_OUTBOX_DIR` and
is intended for local development and tests. It does not deliver mail to recipients. Set
`MAIL_DELIVERY=smtp` and `SMTP_URL` for real delivery; the server logs a warning if production starts
with file delivery. Authentication emails contain plain text only and use links under
`FRONTEND_ORIGIN`: `/verify-email?token=...` and `/reset-password?token=...`. The frontend must send
the token back in the JSON request body.

## Local PostgreSQL setup

Create the development and test databases:

```bash
createdb -U postgres -T template0 "work-be"
createdb -U postgres -T template0 "work-be-test"
```

Then set `DATABASE_URL` and `TEST_DATABASE_URL` in `.env`.

Apply the committed migrations to the development database:

```bash
npm run db:migrate
```

Create the first migration during future schema work:

```bash
npx prisma migrate dev --name describe_the_change
```

Production and CI deployments should apply committed migrations, not use `prisma db push`:

```bash
npm run db:deploy
```

The test database is migrated automatically by the Vitest global setup with
`prisma migrate deploy`. Database integration tests are skipped with a warning if
`TEST_DATABASE_URL` is absent. A guard refuses to run destructive test setup against any database
whose name does not end in `_test` or `-test`.

## Prisma client generation

Prisma 7 uses the ESM `prisma-client` generator, which emits TypeScript into
`src/generated/prisma`. Generated code is ignored by Git, ESLint, and Prettier. Run:

```bash
npm run prisma:generate
```

The `dev`, `build`, `typecheck`, test, and seed scripts run generation automatically.

## Seed data

```bash
npm run db:seed
```

The seed is idempotent and creates fictional users, profiles, gigs, private addresses, applications,
and agreements. It refuses to run when `NODE_ENV=production`.

Every seeded account uses the local development password `WorkDev123!` and is marked email-verified:

- `ana.ribeiro@example.test`
- `bruno.costa@example.test`
- `carla.mendes@example.test`
- `diego.alves@example.test`

The seed hashes this password again on each run with Argon2id. Never reuse this credential outside
local development or load seed data into a production database.

## Development

```bash
npm run dev
```

The server listens on `HOST`/`PORT` (defaults: `127.0.0.1:3000`). Startup validates the environment
and verifies database connectivity before accepting HTTP traffic. If the database is unavailable,
the process exits with a sanitized structured error.

Use `http://localhost:3000` and `http://localhost:5173` consistently in local development. Session
cookies use `SameSite=Lax`; mixing `localhost` and `127.0.0.1` changes the cookie site and can prevent
the browser from sending the session. Cross-origin frontend requests must use
`credentials: 'include'`.

## Production build and startup

```bash
npm run build
npm start
```

The build compiles `src` to `dist`, including the generated Prisma client. Start the compiled
`dist/server.js` with production environment variables. `NODE_ENV=production` requires an explicit
`FRONTEND_ORIGIN`.

## Quality commands

| Command                    | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `npm run typecheck`        | TypeScript checking with no emit.            |
| `npm run lint`             | ESLint over the repository.                  |
| `npm run lint:fix`         | Apply ESLint fixes.                          |
| `npm run format`           | Format with Prettier.                        |
| `npm run format:check`     | Verify formatting without writing.           |
| `npm test`                 | Run all tests once.                          |
| `npm run test:watch`       | Run tests in watch mode.                     |
| `npm run test:unit`        | Run unit tests only.                         |
| `npm run test:integration` | Run API and database integration tests only. |
| `npm run db:studio`        | Open Prisma Studio.                          |

Integration tests create and truncate data in the dedicated test database. They are deterministic
and are not run against `DATABASE_URL`.

## API

All application endpoints are under `/api/v1`.

### `GET /api/v1/health`

Process liveness. Does not query PostgreSQL.

```json
{
  "data": {
    "status": "ok",
    "timestamp": "2026-10-27T15:00:00.000Z"
  }
}
```

### `GET /api/v1/ready`

Verifies that PostgreSQL is reachable with `SELECT 1`. Returns `503` without internal connection
details if the dependency is unavailable.

```json
{
  "data": {
    "status": "ready",
    "checks": {
      "database": "up"
    }
  }
}
```

### Authentication

Authentication uses an opaque `work_session` cookie backed by a server-side database session. In
production the cookie name is `__Host-work_session`; the `__Host-` prefix requires HTTPS, a `/` path,
no domain, and the `Secure` attribute. The cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, and
expires after 30 days. The raw 256-bit token is never stored in PostgreSQL: only its SHA-256 hash is
persisted.

Registration creates an `ACTIVE` account, logs it in immediately by setting the same session cookie,
and sends an email verification link. `emailVerified` reports whether ownership has been confirmed;
the current API allows unverified accounts to authenticate, but future write endpoints should require
a verified email. Browser clients calling the API cross-origin must use `credentials: 'include'`;
CORS allows only `FRONTEND_ORIGIN` with credentials.

Email verification and password reset use random 256-bit tokens. Only SHA-256 token hashes are stored;
tokens are single-use, invalidated by reissue, and expire after 24 hours for verification or 30
minutes for reset. Each account has at most one active token per purpose. Completing a password reset
revokes all existing sessions and also marks the email as verified because control of the address was
proven. Password reset request and confirmation responses do not reveal whether an account exists.
Request endpoints always return `202` with `{"data":{"status":"accepted"}}` for unknown, inactive, or
otherwise ineligible accounts.

Authentication and recovery attempts are throttled with in-process fixed windows. Login allows 30
attempts per IP and 10 per normalized email in 15 minutes. Registration allows 10 valid requests per
IP per hour. Verification and reset requests each allow 10 per IP and 5 per email per hour. Token
confirmation allows 30 attempts per IP per 15 minutes. Blocked requests return `429
TOO_MANY_ATTEMPTS` with `Retry-After`; successful and failed login attempts both count. The counters
are not shared between processes and reset when the server restarts.

Unsafe HTTP methods are checked for CSRF: a present `Origin` must exactly equal `FRONTEND_ORIGIN`,
and `Sec-Fetch-Site: cross-site` is rejected. Non-browser clients may omit both headers. This check
applies to registration, login, logout, email verification, password reset, and future write
endpoints.

#### `POST /api/v1/auth/register`

Creates an active account and immediately establishes a session.

```json
{
  "name": "New User",
  "email": "new.user@example.test",
  "password": "A-long-password"
}
```

```bash
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"name":"New User","email":"new.user@example.test","password":"A-long-password"}' \
  "http://localhost:3000/api/v1/auth/register"
```

Names are trimmed and limited to 2-120 characters. Emails are trimmed, lowercased, validated, and
stored lowercase. Passwords must contain 12-128 characters and cannot be entirely whitespace; the
password value itself is not trimmed. Unknown fields are rejected.

A successful registration returns `201` with the same safe user shape as login and sets the session
cookie. It also creates and sends a single-use email verification link. Registering an existing email,
including one that differs only by case, returns `409 EMAIL_ALREADY_REGISTERED` and does not create a
user, session, or verification email. Registration is also subject to the per-IP limit described
above. If email delivery fails, registration still succeeds; the client can request another link.

#### `POST /api/v1/auth/login`

```json
{
  "email": "ana.ribeiro@example.test",
  "password": "WorkDev123!"
}
```

```bash
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"ana.ribeiro@example.test","password":"WorkDev123!"}' \
  "http://localhost:3000/api/v1/auth/login"
```

A successful login returns the authenticated user and sets the session cookie:

```http
Set-Cookie: work_session=<opaque-token>; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax
```

The example above is for local development. Production uses `__Host-work_session` and adds
`Secure`.

```json
{
  "data": {
    "id": "a0000000-0000-4000-8000-000000000001",
    "name": "Ana Ribeiro",
    "email": "ana.ribeiro@example.test",
    "status": "ACTIVE",
    "emailVerified": true,
    "createdAt": "2026-10-27T15:00:00.000Z",
    "profile": {
      "bio": "Organizo minha rotina entre trabalho e reformas em casa.",
      "imageUrl": null,
      "city": "São Paulo",
      "location": "Vila Mariana"
    }
  }
}
```

Emails are trimmed, lowercased, and matched case-insensitively. Unknown emails, wrong passwords,
inactive accounts, and accounts without a password hash all return the same generic `401
INVALID_CREDENTIALS` response. Unknown body fields are rejected. Login responses use
`Cache-Control: no-store`.

Login attempts are counted per IP and per normalized email. Exceeding either window returns `429
TOO_MANY_ATTEMPTS` with a `Retry-After` header in seconds and does not set a session cookie. The
checks run before password verification so throttled requests do not consume Argon2 resources.

#### `POST /api/v1/auth/logout`

Deletes the current server-side session and clears the cookie. The endpoint is idempotent and
returns `204 No Content`, including when no valid session cookie is present.

```bash
curl -i -b cookies.txt -X POST "http://localhost:3000/api/v1/auth/logout"
```

#### `GET /api/v1/auth/me`

Returns the authenticated user using the same safe fields shown by login. A missing, malformed,
unknown, expired, or inactive-user session returns `401 AUTHENTICATION_REQUIRED`.

```bash
curl -b cookies.txt "http://localhost:3000/api/v1/auth/me"
```

Auth responses are marked `Cache-Control: no-store`. Password hashes, raw session tokens, and
internal session fields are never returned.

#### `POST /api/v1/auth/email-verification/request`

Requests a new verification link. The email is normalized and matched case-insensitively.

```json
{
  "email": "new.user@example.test"
}
```

The endpoint returns `202` with `{"data":{"status":"accepted"}}` whether the account is unknown,
inactive, already verified, or eligible. A link is sent only for an active, unverified account.
Requesting another link invalidates the previous verification token. This endpoint is CSRF-protected
and throttled per IP and email.

#### `POST /api/v1/auth/email-verification/confirm`

Confirms email ownership with the token from the email link. The frontend reads the token from its
`/verify-email?token=...` page and sends it in the JSON body.

```json
{
  "token": "<43-character-token>"
}
```

A successful request returns `204 No Content`; the account's `emailVerified` becomes `true`. Unknown,
used, expired, or wrong-purpose tokens return `400 INVALID_TOKEN` with the same generic message. The
endpoint is unauthenticated, CSRF-protected, and rate-limited per IP.

#### `POST /api/v1/auth/password-reset/request`

```json
{
  "email": "ana.ribeiro@example.test"
}
```

Returns the same generic `202` accepted response for every account lookup. A reset link is sent only
for an active account with a password. Requesting another link invalidates the previous reset token.
The email uses the `/reset-password?token=...` frontend route.

#### `POST /api/v1/auth/password-reset/confirm`

```json
{
  "token": "<43-character-token>",
  "password": "A-new-long-password"
}
```

The password follows the registration policy: 12-128 characters and not entirely whitespace. A
successful reset returns `204 No Content`, changes the password, revokes every session for the
account, consumes the reset token, and invalidates any outstanding verification token. Because
receiving the token proves control of the address, the email is also marked verified. Unknown, used,
expired, or wrong-purpose tokens return `400 INVALID_TOKEN`. The user must log in again with the new
password.

### `GET /api/v1/gigs`

Returns publicly discoverable gigs. Only `OPEN` gigs are public in this milestone. Page size defaults
to 20 and is capped at 50.

Query parameters:

| Parameter  | Description                                                       |
| ---------- | ----------------------------------------------------------------- |
| `page`     | Positive integer, default `1`.                                    |
| `limit`    | Integer from 1 to 50, default `20`.                               |
| `status`   | Optional public status filter. Currently only `OPEN` is accepted. |
| `city`     | Exact city match, case-insensitive, trimmed.                      |
| `category` | Exact category match, case-insensitive, trimmed.                  |

Unknown query parameters are rejected. Results are ordered by `createdAt DESC, id DESC` for stable
pagination.

```bash
curl "http://localhost:3000/api/v1/gigs?page=1&limit=20&city=S%C3%A3o%20Paulo&category=Limpeza"
```

```json
{
  "data": [
    {
      "id": "b0000000-0000-4000-8000-000000000001",
      "title": "Montagem de estante e dois armários",
      "category": "Montagem de móveis",
      "price": {
        "amount": 18000,
        "currency": "BRL"
      },
      "estimatedDurationMinutes": 180,
      "scheduledAt": "2026-11-05T17:00:00.000Z",
      "city": "São Paulo",
      "location": "Vila Mariana",
      "type": "PERSONAL",
      "status": "OPEN",
      "createdAt": "2026-10-27T15:00:00.000Z",
      "employer": {
        "id": "a0000000-0000-4000-8000-000000000001",
        "name": "Ana Ribeiro"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

List responses intentionally omit the full description. The detail endpoint includes it.

### `GET /api/v1/gigs/:gigId`

Returns public details for one discoverable gig. Invalid UUIDs return `400`. Missing gigs and gigs
whose status is not public return `404` with the same generic message.

The response adds `description` and `updatedAt` to the public fields above. Neither the list nor the
detail response includes `GigAddress`, street, number, complement, access instructions, employer
email, password hashes, or internal database fields. Prisma queries use explicit selects and the API
returns explicit DTOs.

## Error format

All application and not-found errors use one shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data.",
    "requestId": "request-id",
    "details": [
      {
        "path": "limit",
        "message": "Too big: expected number to be <=50"
      }
    ]
  }
}
```

- `VALIDATION_ERROR` — `400`, with sanitized field details.
- `BAD_REQUEST` — `400`.
- `AUTHENTICATION_REQUIRED` — `401`.
- `INVALID_CREDENTIALS` — `401`, with a generic message.
- `FORBIDDEN` — `403`, including rejected cross-site mutations.
- `NOT_FOUND` — `404`.
- `CONFLICT` — `409`.
- `EMAIL_ALREADY_REGISTERED` — `409`, for a duplicate account email.
- `INVALID_TOKEN` — `400`, for an invalid, expired, used, or wrong-purpose action token.
- `TOO_MANY_ATTEMPTS` — `429`, with a `Retry-After` header.
- `SERVICE_UNAVAILABLE` — `503`.
- `INTERNAL_SERVER_ERROR` — `500`, always with a generic message.

Stack traces, raw database errors, and credentials are never returned to clients. `details` is
omitted for server errors.

Every response receives an `X-Request-Id` header. A safe incoming `X-Request-Id` is propagated;
otherwise the server generates a UUID. The ID is included in error bodies and structured logs.

## Security decisions

- Environment configuration is validated at startup with Zod. Production requires an explicit,
  non-wildcard frontend origin.
- CORS allows only the configured frontend origin and enables credentials for the session cookie.
- Session cookies are `HttpOnly`, `SameSite=Lax`, scoped to `/`, have no `Domain`, and use the
  `__Host-` prefix and `Secure` in production. Session tokens contain 256 random bits; PostgreSQL
  stores only their SHA-256 hash.
- Unsafe requests enforce a same-origin browser request through the exact `Origin` check and
  `Sec-Fetch-Site`. `SameSite=Lax` provides an additional CSRF boundary. The current deployment
  model assumes the frontend and API share a site.
- Passwords are hashed with Argon2id using 19 MiB of memory, two iterations, and one lane. Login
  performs a dummy hash verification for unknown accounts and returns one generic error for invalid
  email/password, inactive accounts, and missing password hashes.
- Registration requires a 12-128 character password, normalizes the email, hashes the password, and
  creates the user, initial session, and verification token in one transaction. Duplicate emails are
  rejected by both an application check and the case-insensitive unique index.
- Email verification and password reset tokens contain 256 random bits and are stored only as SHA-256
  hashes. They are single-use, purpose-bound, expire quickly, and reissue invalidates the previous
  token. Token confirmations use a generic `INVALID_TOKEN` response.
- Password reset hashes the new password before the transaction, atomically consumes the token,
  updates the password, revokes every session, and invalidates outstanding verification tokens.
- Verification/reset requests return the same generic `202` for eligible and ineligible accounts, so
  account existence is not disclosed. Authentication and recovery throttles run before Argon2
  verification. `TRUST_PROXY` is opt-in because a directly reachable server must not trust
  client-supplied forwarding headers.
- Emails are lowercased for authentication and protected by a case-insensitive unique index.
- Every authenticated request checks the session expiry and current `ACTIVE` user status.
- Account emails are plain text. The file delivery mode writes private local `.eml` files and is not
  a substitute for SMTP in production. Email tokens are placed in frontend URLs; those pages should
  use a restrictive `Referrer-Policy` and avoid third-party resources before the token is consumed.
- Public gig address data is stored separately in `GigAddress` and is never selected by public gig
  queries.
- Public responses use explicit DTOs rather than serializing Prisma models.
- Request bodies and query parameters are validated with Zod; frontend validation is not trusted.
- Structured logs redact PostgreSQL URLs, passwords, secrets, tokens, authorization headers, and
  cookies. Request bodies are not logged.
- Database errors are mapped to safe HTTP responses. Unexpected errors are logged server-side with
  request correlation and return a generic `500`.
- The initial schema uses UUID primary keys, unique constraints, foreign keys, indexes, and database
  check constraints for positive prices/durations, uppercase ISO currency codes, and
  `worker != employer` on agreements.

## Database and money policy

- Monetary values are stored as integers in the currency's minor units (for example, BRL 180.00 is
  stored as `18000`). No floating-point money is used.
- Currency codes are uppercase ISO 4217 three-letter codes stored in `CHAR(3)`.
- Seed data uses `BRL`. No exchange-rate or multi-currency conversion logic exists.
- Timestamps use PostgreSQL `TIMESTAMPTZ(3)`.
- Sessions use UUID primary keys, cascade with their user, index `(userId, expiresAt)`, and enforce
  token-hash format plus `expiresAt > createdAt` with database check constraints.
- `AuthToken` stores one row per user and purpose. It cascades with the user, enforces token-hash
  format, expiry after creation, and used time not before creation. `User.emailVerifiedAt` is null
  until verification succeeds; existing accounts were grandfathered as verified by the migration.
- User emails are normalized to lowercase by migration and protected by both the original unique
  constraint and a case-insensitive unique index.
- The initial model is one agreement per gig (`Agreement.gigId` is unique). Worker selection should
  later be transactional and snapshot the agreed price/currency.
- An application is unique per gig and applicant. Preventing an employer from applying to their own
  gig is a business rule for the future application service; it is not expressible as a simple
  Prisma schema constraint.

## Known limitations

- Email verification is not enforced yet. Unverified accounts can log in, and no protected business
  write endpoints exist where it could be required.
- The default file mailer does not deliver email. Production must configure SMTP or replace the
  mailer with another provider. Delivery failures are logged without message contents or tokens and
  do not fail registration.
- No MFA, account lockout, breached-password screening, email change, or account deletion. Anyone can
  still register an address they do not control and use the account until verification is enforced.
- Login, registration, and recovery rate-limit state is held in process memory. It resets on restart
  and is not shared across multiple instances; a horizontally scaled deployment needs a shared store.
- Registration returns `EMAIL_ALREADY_REGISTERED`, which allows callers to check whether an address
  is registered. This is a deliberate UX tradeoff and is throttled per IP.
- Per-email login throttling can be abused to temporarily block sign-in for a known address. The
  window expires after 15 minutes, but a distributed attacker can keep it active. Reset/verification
  request limits can similarly delay legitimate retries.
- Authentication is cookie-only; no bearer-token or mobile-client flow exists.
- No role model or protected business endpoints yet.
- No gig creation/editing, applications, worker selection, agreements, messaging, notifications,
  reviews, or moderation endpoints.
- Sessions use a fixed 30-day absolute lifetime with no sliding renewal, device listing,
  revoke-all-sessions UI, or per-user active-session cap. Expired rows are cleaned up
  opportunistically on login.
- Account status changes immediately block session use, but future account-management flows should
  also proactively delete existing session rows.
- `SameSite=Lax` assumes frontend and API are deployed on the same site. A cross-site deployment
  would require `SameSite=None; Secure` plus additional CSRF controls.
- Seed credentials are intentionally public and must never be used outside local development.
- Public discovery is limited to `OPEN` gigs; the status filter accepts only that status for now.
- Pagination is offset-based. A cursor strategy may be preferable at larger scale.
- No request body size policy, job queue, caching, or external observability platform.
- Integration tests require a locally available, dedicated PostgreSQL test database.

## Next milestone

1. Account management (email/password changes) and session/device controls.
2. Gig creation and editing for authenticated employers, requiring verified email.
3. Applications for authenticated workers.
4. Transactional worker selection and agreement creation.

Do not expose additional write or protected operations without explicit ownership authorization.
