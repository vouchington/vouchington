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
shared at the edge, and cookie-free client responses remain publicly cacheable with `Cookie` and
`Authorization` in their outer `Vary`. When the gateway delivers newly minted session cookies, only
that final client response becomes no-store; the cookie-free shared entry remains reusable. After
login, the same browser URL is fetched as an authenticated variant and the Worker bypasses its
shared cache.

The Cloudflare Worker owns HTTP cache lifetimes. Origins signal cacheability with plain `public`
for cacheable anonymous responses and `private, no-store` for authenticated responses; they do not
choose a freshness duration. The Worker applies its audience and route policy before returning a
cacheable response to the client. Direct origin requests, including local development paths that
bypass the Worker, receive the origin signal without an explicit freshness lifetime. A direct
client must revalidate or apply its own HTTP caching policy rather than assume the edge lifetime.

## Cache Invalidation

- **Entity cache**: Invalidated on mutations via job queue (`invalidate.*` from `@services/entity-cache`). Lookup caches and entity caches are invalidated separately when identifiers change (username, slug, aliases, URL).
- **Search cache**: Natural expiry under its own Valkey TTL, independent of HTTP caching. No explicit invalidation.
- **Anonymous origin snapshots and search caches**: Natural TTL expiry. Content and eligibility
  belong to the same snapshot, so a cached public identity cannot authorize a newly private body.
- **CF Worker edge cache**: Freshness comes from the Worker's audience and route TTL policy.
  Anonymous readers may observe a cached response until it expires, including after a public post
  changes visibility. Requests must not query the origin merely to re-check whether cached posts
  are still public. Server-to-CDN `Cache-Tag` purging is reserved for legal removal obligations,
  including copyright removal and user deletion; it is not a freshness mechanism. The authenticated
  purge path remains separate from ordinary expiry and must fail visibly if a required legal purge
  cannot complete.
  All regular cached responses carry one shared legal-removal tag so legal erasure can evict
  embedded content in threads, lists, HTML, and feeds without collecting dependency identities
  before streaming. The staging canary keeps its separate override tag.
  Account deletion attempts an immediate purge after the privacy fence commits, but keeps the
  coarse purge owed until erasure and sibling external work finish. Its final durable purge must
  complete before deletion is acknowledged. Copyright withholds await successful eviction before
  their durable action completes. Purge failure retains the action's existing retry and explicit
  operator-replay path; it cannot disappear with a lost or exhausted cache-purge queue job.
  Before that edge purge, legal removal advances the anonymous origin cache namespace, so
  old in-flight origin fills cannot repopulate the edge from the current namespace.
  Deployed copyright completion also fails if legal purging is disabled or its target is missing;
  local and undeployed environments retain their explicit no-cache opt-out. This intentionally
  evicts broadly after legal removal, with an unmeasured cache-warmup cost.

## What is NOT Cached

Anonymous SSR HTML is cached — see
[Anonymous HTML edge caching vs. CSP nonces](./anon-html-edge-caching-csp.md) for why that's safe
despite the per-request CSP nonce. What's still excluded from the edge cache:

- **Authenticated responses**: CF Worker bypasses cache entirely for authenticated users
- **RSC fetches**: `?_rsc=1` / `accept: text/x-component` navigations bypass the edge cache today,
  even for anonymous users — pending staging verification of RSC-navigation nonce consistency (see
  the nonce doc's [RSC navigation](./anon-html-edge-caching-csp.md)
  section)
- **Login page**: `/login` and `/login/` bypass the edge cache so Cloudflare Turnstile renders on
  every page load
- **`/auth/callback*`**: OAuth popup-relay pages bypass the edge cache — a stale cached page mid-flow
  would replay a previous provider's callback params to the client-side relay script
- **Admin routes**: bypass unconditionally regardless of auth state, to prevent cross-user leakage
  if JWT verification is temporarily unavailable
- **Responses with `Set-Cookie`**: Origin cookies exclude a response from the shared edge cache.
  Gateway-minted session cookies are appended after the shared lookup, and their final response is
  no-store for browsers and downstream intermediaries. Cookie delivery does not bypass anonymous
  edge caching or change its lifetime.
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

Anonymous post-thread ancestors and descendants use the same cache path as other public content
responses. Their freshness follows the Cloudflare Worker's TTL policy, including accepted lag
after visibility changes; a request must not probe the origin merely to re-check whether cached
posts are still public. Authenticated responses remain private and uncacheable. Server-to-CDN
`Cache-Tag` purges are reserved for legal removals such as copyright and user deletion, rather
than freshness. Owner-only user collections continue to require authentication and are never
made public by this cache policy.

## Related

- [Anonymous HTML edge caching vs. CSP nonces](./anon-html-edge-caching-csp.md) — why anon HTML is cacheable despite the per-request CSP nonce, and the placeholder-nonce safety argument
- [Backend rules](../../../backend/AGENTS.md) — service and data conventions
- [Web rules](../../../web/AGENTS.md) — UI and routing conventions

- [docs/overview/architecture/ai-agents.md](./ai-agents.md)
- [docs/overview/architecture/auth-overview.md](./auth-overview.md)
