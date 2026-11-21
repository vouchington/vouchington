Review cross-tier caching coherence. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Unit: one cache boundary between two tiers.

- Check [Caching Strategy](../../overview/architecture/caching-strategy.md) and [Anonymous HTML edge caching vs. CSP nonces](../../overview/architecture/anon-html-edge-caching-csp.md) against one boundary spanning tiers: cache-key/`Vary` at the Worker, edge vs backend `Cache-Control` TTL alignment, Valkey entity/search TTLs, Cache-Tag purge coverage. Tier-internal work belongs to [api-performance.md](api-performance.md), [cloudflare-worker.md](cloudflare-worker.md), [valkey.md](valkey.md), and [seo-indexing.md](seo-indexing.md).
- Guard what is not cached: a new authenticated, personalized, `Set-Cookie`, or ancestor-embedding endpoint must join the bypass set.
- Do not add an HTTP cache layer, opt into `cross_version_cache`, or wire votes/elections into Cache-Tag purge without updating `caching-strategy.md` first; verify the doc against source and keep it synchronized.
