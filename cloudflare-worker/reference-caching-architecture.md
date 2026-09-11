# Caching Architecture

[Back to Cloudflare Worker](README.md#caching-architecture)

See [docs/overview/architecture/caching-strategy.md](../docs/overview/architecture/caching-strategy.md) for the full caching strategy.

Key points for this worker:

- Next.js does not set `Cache-Control` headers -- the CF Worker is the sole HTTP caching layer
- CSP is not stored in shared cache entries; web responses receive the current request's CSP after
  cache lookup
- Static assets (`/_next/static/*`) are served directly by Next.js during HTTP local development;
  HTTPS local development uses the same-origin Worker URL to avoid mixed content. CloudFront owns
  them in staging and production. Each environment selects that route through
  `NEXT_PUBLIC_ASSET_PREFIX`.
  Playwright CI builds use the fixed logical origin `http://localhost`; Chromium maps that origin's
  default port to the shard's Next standalone port, so browser asset traffic bypasses Wrangler while
  the compiled build remains reusable across shard ports ([#10990](https://github.com/jonathanong/filaments/issues/10990)).
  Web-integration builds leave the prefix unset and verify assets through the same-origin Worker.
- Images (`/images/*` and `/sideload/*`) are served via the image-host CloudFront distribution in production, not through this worker.
- Cached responses include `stale-while-revalidate` (2× TTL) so the edge serves stale content instantly during revalidation
- `stale-if-error=86400` configures a 24h stale-on-origin-error cap; staging validation must confirm Workers Cache honors the directive

### Cache Key Separation

Workers Cache keys each dispatch by the named entrypoint and Worker version, the canonical request
URL, and `ctx.props`. The gateway passes `audience` in `ctx.props`, so bot, anonymous, and static
responses occupy independent partitions without rewriting the public URL. Anonymous and bot
requests each warm only their own partition; there is no cross-population write. `cross_version_cache`
is intentionally absent from the private deployment manifest, so a deployment does not opt into sharing cache
entries across Worker versions.

| Audience | `ctx.props.audience` | TTL                          |
| -------- | -------------------- | ---------------------------- |
| Static   | `static`             | Route-specific, normally 24h |
| Bot      | `bot`                | 24h                          |
| Anon     | `anon`               | 30s                          |
| Auth     | No dispatch          | —                            |
