# Caching Strategy reference

[Back to Caching Strategy](caching-strategy.md)

## Architecture Overview

```
                        +------------------+
                        |   CloudFront     |
                        | (static assets,  |
                        |  images)         |
                        +--------+---------+
                                 |
User -----> CF Worker (gateway, always runs) ----+----> Next.js (HTML pages)
              |                                  |
              | (cacheable audiences)            |
              v                                  |
        CachedOrigin (Workers Cache,        <----+
        runs only on a platform MISS)
              |
              +----> Backend API
                       |
                       +----> Valkey (entity + search cache)
                       |
                       +----> PostgreSQL
```

- **CloudFront**: Serves static assets (`/_next/static/*`) and images (`/images/*`, `/sideload/*`)
- **CF Worker**: A always-run gateway (session detection, security headers, rate limiting) dispatches
  cacheable audiences (anon/bot HTML, sitemaps, static paths) to `CachedOrigin`, a separate
  `WorkerEntrypoint` that Cloudflare's **Workers Cache** (GA) sits in front of. On a platform HIT,
  `CachedOrigin` never runs — the gateway still runs on every request (auth, rate limiting, security
  headers) and rewrites the per-request CSP nonce into the cached body on the way out. See
  [Anonymous HTML edge caching vs. CSP nonces](./anon-html-edge-caching-csp.md) for why a nonce-bearing
  page can be cached at all.
- **Next.js**: Server-side rendering only; does not set `Cache-Control` headers -- the CF Worker controls caching
- **Backend**: Sets `Cache-Control` headers for logged-out users; uses Valkey for entity and search caches
- **Valkey**: In-memory cache for entity lookups and search results
- **PostgreSQL**: Primary data store

## Asset Routing

| Path                                                                           | Ordinary local development                        | Playwright CI                                   | Staging / production                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `/_next/static/*`                                                              | HTTP: Next.js directly; HTTPS: same-origin Worker | Same-origin CF Worker -> Next.js                | CloudFront CDN via `NEXT_PUBLIC_ASSET_PREFIX`                    |
| `/images/*`                                                                    | Browser -> image-lambda direct (`IMAGE_ORIGIN`)   | Browser -> image-lambda direct (`IMAGE_ORIGIN`) | Browser -> `images{,-staging}.voucha.ai` -> CloudFront -> Lambda |
| `/sideload/*`                                                                  | Browser -> image-lambda direct (`IMAGE_ORIGIN`)   | Browser -> image-lambda direct (`IMAGE_ORIGIN`) | Browser -> `images{,-staging}.voucha.ai` -> CloudFront -> Lambda |
| `/api/*`, `/infra/*`                                                           | CF Worker -> Backend                              | CF Worker -> Backend                            | CF Worker -> Backend                                             |
| `/md/*`, `/rss*`                                                               | CF Worker -> Backend                              | CF Worker -> Backend                            | CF Worker -> Backend                                             |
| `/sitemap.xml`, `/sitemap/*`, `/sitemaps/*`                                    | CF Worker -> CloudFront (`SITEMAPS_ORIGIN`)       | CF Worker -> CloudFront (`SITEMAPS_ORIGIN`)     | CF Worker -> CloudFront -> private S3                            |
| `/favicon.ico`, `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/.well-known/*` | CF Worker (inline, cached)                        | CF Worker (inline, cached)                      | CF Worker (inline, cached)                                       |
| Everything else                                                                | CF Worker -> Next.js                              | CF Worker -> Next.js                            | CF Worker -> Next.js                                             |

See [Worker caching architecture](../../../cloudflare-worker/reference-caching-architecture.md)
for the CI asset route shared by Playwright and web-integration tests.
