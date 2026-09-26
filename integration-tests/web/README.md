# Web Integration Tests

Fetch-based full-stack integration tests for the built web application.

## Suite Boundaries

| Suite                                       | Scope                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| [`integration-tests/web/`](.)               | `client → Cloudflare Worker → Next.js → backend` — fetch-level full-stack |
| [`integration-tests/web-api/`](../web-api/) | `web/lib/api/**` helpers talking directly to the backend                  |
| [`playwright/`](../../playwright/)          | Browser, hydration, and interaction behavior                              |

Use this suite (not Playwright) for: status codes, redirects, route existence, headers/cache behavior, `robots.txt`/`llms.txt`, metadata, canonical links, JSON-LD, static copy, link attributes.

## Running

- `pnpm run test:integration:web` — runs `pretest:integration:web` setup automatically
- `pnpm run test:integration:web:setup` — manual prebuild/setup (use before repeated direct Vitest runs)
- Direct: `pnpm exec vitest --project web-integration` (requires prior manual setup)
- Vitest project name: `web-integration` in root `vitest.config.mts`

CI keeps this full-stack project separate from `web-api`. `tests-web-api.yml` needs only
Postgres/Valkey and backend setup; it does not build Next.js or the Worker. `tests-web-integration.yml`
retains the built Worker → Next.js → backend contract and its CPU runner. Both keep independent
matrix/report identities; integration stays at one shard because its build/setup is the dominant
cost.

Global setup clears Vitest's inherited `VITEST` marker for the standalone Next.js child. In-process
Vitest may read catalog JSON, but the live test server fetches copy from the backend; the OAuth
callback baseline checks for a successful localization request in the backend trace.

The shared readiness helpers intentionally run probes serially: a probe settles, its result is
checked, and only a failed result is followed by the configured delay. Poll callbacks must never
overlap because many callers inspect stateful local services.

## Worker Response Contract

Every response received through `WebIntegrationClient.request()` must carry the Worker's
`x-request-id`; it scopes backend tracing to the request that produced a page. During a supervised
Wrangler restart, an idempotent request that resolves without that header is discarded and retried
within the client's existing bounded retry schedule. Non-idempotent requests and exhausted retries
throw a response-rejection error. Accepted responses, including non-2xx responses, retain their
original body and fetch metadata.

Read [CLAUDE.md](CLAUDE.md) before changing suite setup, artifacts, data ownership, tracing, or
failure behavior.

## Authentication Isolation

Generic authenticated route tests mint fresh device and session cookies with
`createTestAuthCookies(TEST_USER_ID)`. They do not exercise the email-login limiter. The dedicated
authentication contract performs the suite's one real email login through the Worker; its client
uses the suite-randomized email that global setup associates with the seeded user and sends a
UUID-derived IP from the RFC 3849 documentation prefix. No login-verification rate-limit identity
is therefore shared across parallel runs.

## Web API Coverage

Every new API helper added to `web/lib/api/client/` or `web/lib/api/server/` must have a corresponding test case in [`integration-tests/web-api/__tests__/routes.public.test.mts`](../web-api/__tests__/routes.public.test.mts) or `integration-tests/web-api/routes-extended-tests/*.test.mts`.

### Patterns

```ts
// Server route (GET helper from Next.js server component)
const result = await serverRoutes.getMyThing({ id: 'some-id' })
expect(result).toMatchObject({ ... })

// Client route (mutation helper from client component)
const result = await withClientRuntime(() => clientRoutes.createMyThing({ ... }))
expect(result).toMatchObject({ ... })

// Auth: use authCookie from createTestSession(), adminAuthCookie from createAdminTestSession()
```

### Exempt modules

| Module                            | Reason                                  |
| --------------------------------- | --------------------------------------- |
| `psql` (client + server)          | Infrastructure helper, not an API route |
| `valkey` (client + server)        | Infrastructure helper, not an API route |
| `images` (client)                 | Requires S3 presigned URLs              |
| `memberships` (client, mutations) | Requires Stripe                         |

### Coverage gaps (add when next modified)

- `mq` (client) — pauseQueue, resumeQueue, retryFailedJobs
- `memberships` (server — read-only: getPlans, getMembership; requires Stripe in test env)
