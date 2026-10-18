Review cross-tier caching coherence. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Check [Caching Strategy](../../overview/architecture/caching-strategy.md) and [Anonymous HTML edge caching vs. CSP nonces](../../overview/architecture/anon-html-edge-caching-csp.md) against one boundary that spans tiers. Tier-internal work belongs elsewhere: backend API round-trips in [api-performance.md](api-performance.md), Worker routing/headers in [cloudflare-worker.md](cloudflare-worker.md), Valkey internals in [valkey.md](valkey.md), and cache-sensitive indexing in [seo-indexing.md](seo-indexing.md).
- Prioritize cross-tier coherence that the per-tier prompts miss: cache-key/`Vary` correctness at the Worker boundary, TTL alignment between edge and backend `Cache-Control`, Valkey entity/search TTLs, and Cache-Tag purge coverage.
- Guard the "what is NOT cached" boundary: a new authenticated, personalized, `Set-Cookie`, or ancestor-embedding endpoint must join the bypass set — never let a personalized response become publicly cacheable or fragment the anon partition.
- Do not add a new HTTP cache layer, opt into `cross_version_cache`, or wire votes/elections into Cache-Tag purge (they self-heal within the anon TTL) without updating `caching-strategy.md` first.
- Verify the doc against current source before editing tables or TTLs, and keep `caching-strategy.md` synchronized when a boundary changes.
- Skip findings already covered by open issues or open PRs.
- Add or tighten tests for the selected cache-key, TTL, `Vary`, purge, or bypass behavior.
