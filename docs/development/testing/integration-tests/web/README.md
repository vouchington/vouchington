# Web Integration Tests

Source entrypoint: [integration-tests/web/README.md](../../../../../integration-tests/web/README.md). Read [AGENTS.md](../../../../../integration-tests/web/AGENTS.md) before changing suite setup, artifacts, data ownership, tracing, or failure behavior.

Fetch-based tests of the built application along `client -> Cloudflare Worker -> Next.js -> backend`. Use this suite, not Playwright, for status codes, redirects, route existence, headers and cache behavior, `robots.txt`/`llms.txt`, metadata, canonical links, JSON-LD, static copy, and link attributes.

- **Separate CI projects.** `web-api` needs only Postgres, Valkey, and the backend; `web-integration` needs the built Worker and Next.js and stays at one shard because its build and setup dominate cost.
- **Reserved ports.** Global setup reserves the backend, image lambda, Next.js, worker, and inspector ports outside the kernel ephemeral range. A port from `listen(0)` can be handed to a localhost connection as a source port during a child's startup, which then fails to bind with `EADDRINUSE`.
- **Serial readiness probes.** Probe callbacks never overlap, because many callers inspect stateful local services.
- **Worker response contract.** Every response through `WebIntegrationClient.request()` must carry the Worker's `x-request-id`, which scopes backend tracing to the request. During a supervised Wrangler restart an idempotent request without it is retried within the bounded schedule; non-idempotent requests and exhausted retries throw.
- **Authentication isolation.** Authenticated route tests mint fresh cookies with `createTestAuthCookies`. Only the dedicated authentication contract performs a real email login, with a suite-randomized email and a documentation-prefix IP, so no login rate-limit identity is shared across parallel runs.
- **API helper coverage.** Every new helper in `web/lib/api/client/` or `server/` needs a case in the `web-api` route tests. Infrastructure helpers (`psql`, `valkey`) and Stripe- or S3-dependent ones are exempt.
