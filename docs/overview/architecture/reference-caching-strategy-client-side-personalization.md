# Caching Strategy reference

[Back to Caching Strategy](caching-strategy.md)

## Client-Side Personalization

All user preferences are stored in `localStorage` -- no cookies, no server-side reads, no database persistence. This ensures cached pages are identical for all anonymous users.

| Preference      | Key          | Default   |
| --------------- | ------------ | --------- |
| Theme           | `theme`      | `dark`    |
| Post list style | `list-style` | `card`    |
| Feed style      | `feed-style` | `summary` |

Architecture: `web/lib/preferences/` -- shared types/defaults, localStorage read/write, React context providers, and a blocking theme script to prevent flash of wrong theme.

HTTP API responses are a separate concern from preference storage. Anonymous optional-auth JSON is
publicly cacheable, but its outer response varies on `Cookie` and `Authorization`. After login, the
same browser URL is fetched as an authenticated variant and the Worker bypasses its shared cache.

## Cache Invalidation

- **Entity cache**: Invalidated on mutations via job queue (`invalidate.*` from `@services/entity-cache`). Lookup caches and entity caches are invalidated separately when identifiers change (username, slug, aliases, URL).
- **Search cache**: Natural TTL expiry (60s). No explicit invalidation.
- **CF Worker edge cache**: Natural TTL expiry (30s anon, 24h bot/static) **plus** explicit
  `Cache-Tag` purge. `@services/entity-cache/invalidate.mts` mints tags for the mutated
  entity (`ts-shared/cache/cache-tags.mts` — `post:`, `topic:`, `user:`, `community:`,
  `list:`, `story:`, `hostname:`, RSS feed/item tags, and coarse `sitemap`/`html` tags, using
  both UUID and every known slug/alias/hostname form where those identifiers route publicly) and
  POSTs `{tags}` to the worker's
  `POST /infra/cache-purge`, gated by the `x-voucha-cache-purge-secret` header (reuses the
  existing `CF_WORKER_SECRET` value under a distinct header name) and an explicit
  `CF_WORKER_ROUTE` env var. The purge worker skips quietly when that route is unset instead of
  guessing at `https://voucha.ai`, which keeps undeployed environments from sending purge jobs to
  a production origin. The worker forwards the tags to `CachedOrigin`'s `purge(tags)` RPC method,
  which calls `ctx.cache.purge({tags})` and throws if the cache binding is unavailable
  (fail-closed, rather than silently no-oping on a cache-correctness path). Cloudflare accepts
  only printable ASCII excluding space, at most 1024 bytes per tag, and fails the whole batch on
  one bad tag, so `ts-shared/cache/cache-tag-encoding.mts` percent-encodes every identifier into
  that alphabet (truncating on an escape boundary at the cap) and the purge route rejects a
  non-conforming batch with 400 rather than letting it surface as a retried 502. Votes/elections are
  intentionally **not** wired to this purge path — see `cache-tags.mts` — and self-heal within the
  existing anon TTL instead.

## What is NOT Cached

Anonymous SSR HTML **is now cached** (previously bypassed) — see
[Anonymous HTML edge caching vs. CSP nonces](./anon-html-edge-caching-csp.md) for why that's safe
despite the per-request CSP nonce. What's still excluded from the edge cache:

- **Authenticated responses**: CF Worker bypasses cache entirely for authenticated users
- **RSC fetches**: `?_rsc=1` / `accept: text/x-component` navigations bypass the edge cache today,
  even for anonymous users — pending staging verification of RSC-navigation nonce consistency (see
  the nonce doc's [RSC navigation](./anon-html-edge-caching-csp.md#whats-not-yet-covered-rsc-navigation)
  section)
- **Login page**: `/login` and `/login/` bypass the edge cache so Cloudflare Turnstile renders on
  every page load
- **`/auth/callback*`**: OAuth popup-relay pages bypass the edge cache — a stale cached page mid-flow
  would replay a previous provider's callback params to the client-side relay script
- **Admin routes**: bypass unconditionally regardless of auth state, to prevent cross-user leakage
  if JWT verification is temporarily unavailable
- **Responses with `Set-Cookie`**: Not safe to cache publicly
- **Non-2xx responses**: Only successful responses are cached; 4xx/5xx responses are also marked
  no-store before returning to the client
- **Write operations**: POST, PATCH, PUT, DELETE requests
- **Private/personalized endpoints**: `/api/v1/my/*`, `/api/v1/feeds/*`, `/api/v1/bookmarks/*`,
  `/api/v1/me/*`, `/api/v1/auth/*`, `/api/v1/session`, `/api/v1/recommended-topics`,
  and any endpoint requiring authentication. The Worker policy
  bypasses `CachedOrigin` for those documented backend route families and forces no-store
  headers on the client response as a defense in depth if an origin route accidentally emits a
  public header. When a bot-classified request hits one of these private bypasses, the Worker
  keeps the bot session invariant and strips `st`/`dt` before forwarding to the backend.
- **`GET /api/v1/posts/:idOrSlug/ancestors`**: the Cache-Tag scheme tags API detail routes by a
  single leaf `idOrSlug`, but this response embeds every ancestor post, so a parent-post edit
  would have no tag to purge a cached response by — the route bypasses edge caching entirely
  instead of risking stale ancestor data

## Related

- [Anonymous HTML edge caching vs. CSP nonces](./anon-html-edge-caching-csp.md) — why anon HTML is cacheable despite the per-request CSP nonce, and the placeholder-nonce safety argument
- [Backend rules](../../../backend/CLAUDE.md) — service and data conventions
- [Web rules](../../../web/CLAUDE.md) — UI and routing conventions

- [docs/overview/architecture/ai-agents.md](./ai-agents.md)
- [docs/overview/architecture/auth-overview.md](./auth-overview.md)
