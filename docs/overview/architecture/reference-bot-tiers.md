# Bot Tiers

[Back to Caching Strategy reference](reference-caching-strategy-cache-tiers.md#bot-tiers)

Bots detected by `isbot()` are classified into two tiers with different rate-limiting behavior:

| Tier      | Examples                                                                                                 | Rate limit                                                      |
| --------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `known`   | Googlebot, Bingbot, ChatGPT-User, PerplexityBot, ClaudeBot, facebookexternalhit, Twitterbot, UptimeRobot | Pre-cache (same as humans)                                      |
| `unknown` | Any other bot detected by `isbot()`                                                                      | Post-cache via `RATE_LIMITER_BOT_*` (cached responses are free) |

Cache behavior (TTL, cookie stripping) is identical for all bots regardless of tier. The tier only affects rate limiting. The `x-voucha-bot-tier` response header indicates the detected tier.

Cached responses use headers built by `buildCacheControlHeader()`
(`cloudflare-worker/src/cache-policy.mts`):
`public, max-age={TTL}, stale-while-revalidate={TTL*2}, stale-if-error=86400`.
Workers Cache (unlike `caches.default`) is the sole cache layer for these responses — there's no
downstream shared cache to target with `s-maxage`, so `max-age` carries the TTL directly.

- **`stale-while-revalidate={TTL*2}`**: The edge serves stale content instantly while fetching fresh in the background. This eliminates perceived latency during the revalidation window — users never wait for origin while the cache is being refreshed.
- **`stale-if-error=86400`**: Configures a 24-hour stale-on-origin-error cap instead of relying on an unbounded platform default. Staging must confirm that Workers Cache honors the directive before the TTL rollout proceeds.

`/sideload/*` is not part of this cache tier because absolute image-host URLs bypass the Worker.

Workers Cache has no response-header-based cache-key normalization (the classic `No-Vary-Search`
header only applied to `caches.default`). Instead, the gateway pre-normalizes the URL it dispatches
with — `cloudflare-worker/src/cache-no-vary-search.mts`'s `normalizeCacheUrl()` strips marketing/
tracking params (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`,
`fbclid`, `msclkid`, `mc_cid`, `mc_eid`) and sorts remaining params, so e.g. `?utm_source=a` and
`?utm_source=b` — or `?a=1&b=2` vs. `?b=2&a=1` — collapse to the same cache entry. Meaningful
params (search, filters, pagination, `apikey`, `referrer`, `next`) are preserved.

CSP is no longer stripped on writeback/added after lookup — `CachedOrigin` stamps every cacheable
web HTML response with a fixed placeholder nonce (instead of a real one) in both the body and the
`Content-Security-Policy` header it emits, and the gateway's `addSecurityHeaders()` unconditionally
rebuilds that header with a fresh real nonce on every response, on both the dispatch and bypass
paths. See [Anonymous HTML edge caching vs. CSP nonces](./anon-html-edge-caching-csp.md) for the
full mechanism and its safety properties.

The worker overwrites the backend's `max-age` with its own edge TTL. The backend's `Cache-Control` header signals "this response is publicly cacheable" rather than dictating the exact edge TTL.
Origin responses with `Cache-Control: private`, `no-store`, or `no-cache` are never written to the
shared Worker cache.

Origin responses with status 4xx/5xx are never written to the shared Worker cache, even if the
origin accidentally sends a public cache directive. Before returning those failures, the Worker
overwrites shared-cache directives with `Cache-Control: no-store, max-age=0, must-revalidate`,
`CDN-Cache-Control: no-store`, and `Cloudflare-CDN-Cache-Control: no-store`.
