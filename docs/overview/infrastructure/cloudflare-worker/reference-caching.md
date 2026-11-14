# Caching

[Back to Cloudflare Worker](README.md#caching)

Caches other routes through configuration such as:

- `/favicon.ico`
- `/robots.txt`

Cacheable anonymous backend responses send plain `Cache-Control: public`; authenticated responses
send `private, no-store`. Origins signal eligibility only. The Worker owns the audience and route
TTL policy and applies freshness and stale-response directives to cached responses. Cacheable
audiences are dispatched to `CachedOrigin`, a separate `WorkerEntrypoint` behind Cloudflare's
Workers Cache; on a platform HIT, `CachedOrigin` never runs. Direct-origin requests receive no
origin-specified freshness lifetime. See [the caching strategy](../../architecture/caching-strategy.md)
for the tier boundaries and [anonymous HTML caching](../../architecture/anon-html-edge-caching-csp.md)
for the CSP nonce design.
Routine publication changes do not issue server-to-CDN freshness purges. Explicit copyright and
account deletion retain legal Cache-Tag purging after the anonymous origin namespace has advanced.

`CachedOrigin` keeps the path-derived entity tag and appends one valid `Cache-Tag` supplied by a
trusted origin response. The backend post detail supplies its visible author's `user:<id>` tag.
For a post-detail HTML cache fill, the web proxy makes a lightweight HEAD request to read the same
backend dependency header and places it on the HTML response, so a required legal user-deletion purge can evict both cached API
and HTML details. Tags are reserved for legal removal obligations, not freshness; ordinary changes
wait for the Worker-owned TTL (bio-language changes included). A failed dependency lookup marks the HTML response `Vary: *`; the Worker declines
to cache it while the page can still render. Missing, malformed, duplicate, or multi-tag origin
values leave the path-derived tag intact. Anonymous posts supply no author tag.

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
[staging Basic Auth runbook](../../../operations/cloudflare-worker-staging-auth.md#verify) owns live
validation of the protected canary and all three fault controls; the private infrastructure
deployment receiver has no copy of either operator credential.
