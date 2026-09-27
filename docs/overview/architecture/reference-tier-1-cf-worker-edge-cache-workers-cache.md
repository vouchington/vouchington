# Tier 1: CF Worker Edge Cache (Workers Cache)

[Back to Caching Strategy reference](reference-caching-strategy-cache-tiers.md#tier-1-cf-worker-edge-cache-workers-cache)

The CF Worker is the sole HTTP caching layer, backed by Cloudflare's **Workers Cache** (GA), which
sits in front of the `CachedOrigin` `WorkerEntrypoint`. On a platform HIT, `CachedOrigin` never
runs — the always-run gateway (`default` export) still handles auth/session detection, rate
limiting, and security headers on every request, then rewrites the per-request CSP nonce into the
cached body on the way out. See
[Anonymous HTML edge caching vs. CSP nonces](./anon-html-edge-caching-csp.md) for why anon HTML —
which carries a per-request CSP nonce — can be cached at all.

**Cache key** = the named entrypoint and Worker version + canonical request + `ctx.props`
(`audience`, `isRsc`, and `lang` for the anon audience only, omitted at the default UI locale).
No cookies are in the platform key. `cross_version_cache` is intentionally absent from the private
deployment manifest, so deployments do not opt into reusing cache entries across Worker versions.
Bot, anonymous, and static requests each dispatch with their own audience and warm only that
partition; there is no anonymous-to-bot cross-population write.

| Audience                               | TTL                               | Details                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bot` (detected via `isbot`)           | 24h (`BOT_CACHE_TTL_SECONDS`)     | Cookies stripped before forwarding cacheable requests to origin                                                                                                                                                                                                                                                                                                   |
| `anon`                                 | 30s (`ANON_CACHE_TTL_SECONDS`)    | Cookies stripped. Covers anon HTML documents (see the [anonymous HTML caching nonce document](./anon-html-edge-caching-csp.md)) as well as anon API/other GET responses. Partitions by UI locale via `ctx.props.lang` (#6994); omitted at `DEFAULT_UI_LOCALE` (`en`) so only non-default locales add cache fan-out.                                               |
| `static` — sitemaps                    | 24h (`SITEMAP_CACHE_TTL_SECONDS`) | `/sitemap.xml`, `/sitemaps/*`                                                                                                                                                                                                                                                                                                                                     |
| `static` — RSS                         | 5min (`RSS_CACHE_TTL_SECONDS`)    | RSS feed routes                                                                                                                                                                                                                                                                                                                                                   |
| `static` — configured paths            | 24h (`STATIC_CACHE_TTL_SECONDS`)  | `/favicon.ico`, `/robots.txt`, `/llms.txt`, `/llms-full.txt`, well-known specs, configurable via `CACHED_STATIC_PATHS`                                                                                                                                                                                                                                            |
| Authenticated                          | Bypass                            | No caching; gateway forwards directly to origin using today's per-request nonce path                                                                                                                                                                                                                                                                              |
| Login / `/auth/callback` / admin / RSC | Bypass                            | `/login`, `/login/` (Turnstile must render fresh); `/auth/callback*` (sets session cookies); admin routes; RSC fetches (`?_rsc=1` / `accept: text/x-component`) stay bypass pending staging verification of RSC-navigation nonce consistency (see the nonce doc's [RSC navigation](./anon-html-edge-caching-csp.md#whats-not-yet-covered-rsc-navigation) section) |
