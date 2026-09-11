# Caching

[Back to Cloudflare Worker](README.md#caching)

Caches other routes through configuration such as:

- `/favicon.ico`
- `/robots.txt`

All public backend GET endpoints set `Cache-Control: public, max-age=N` headers for logged-out users — this signals the response is safe to cache publicly. Cacheable audiences are dispatched to `CachedOrigin`, a separate `WorkerEntrypoint` that Cloudflare's Workers Cache (GA) sits in front of; on a platform HIT, `CachedOrigin` never runs. The worker overwrites the backend's `max-age` with its own edge TTL (`ANON_CACHE_TTL_SECONDS`, default 30s) via `public, max-age=${TTL}, stale-while-revalidate=${TTL * 2}, stale-if-error=86400` on cached responses. The 30-second anonymous TTL remains in place while the auth-transition hardening is staged; raising it to 300 seconds is a separate gated rollout. See [docs/overview/architecture/caching-strategy.md](../docs/overview/architecture/caching-strategy.md) for the full tier/audience breakdown and [docs/overview/architecture/anon-html-edge-caching-csp.md](../docs/overview/architecture/anon-html-edge-caching-csp.md) for how anon HTML caches despite its per-request CSP nonce.

### Staging cache canary

`/infra/edge-cache-canary` is a non-discoverable validation route. In non-production it follows the
real anonymous `CachedOrigin` path and generates JSON only on a platform MISS/revalidation, using
the configured anonymous TTL/SWR/SIE policy and the dedicated `edge-cache-canary` purge tag. The
gateway keeps the browser boundary `no-store` and supplies a fresh request ID. Staging Basic Auth
protects it when `BASIC_AUTH_CREDENTIALS` is configured; local non-production without that binding
is intentionally open for tests. `PRODUCTION=true` hard-disables it with 404 at both gateway and
cache-fill boundaries.

The staging-only fault controls use `X-Voucha-Staging-Canary-Secret` plus the exact
`X-Voucha-Staging-Canary-Fault` kinds `sie`, `purge-reject`, and `unexpected-throw`. The gateway
validates `CF_WORKER_SECRET`, route, method, environment, and kind, then relays only a cache-key-
invisible internal enum. Every external/internal control header is stripped before origins and is
never returned. The operator-authenticated smoke procedure in the
[staging Basic Auth runbook](../docs/operations/cloudflare-worker-staging-auth.md#verify) owns live
validation of the protected canary and all three fault controls; the private infrastructure
deployment receiver has no copy of either operator credential.
