# API Routes

HTTP API route reference for Voucha. Routes are thin controllers over `@services/*`.

## Documentation Split

| File        | Purpose                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------ |
| `README.md` | Route map, required headings, shared response/caching/typing patterns, and extracted links |
| `CLAUDE.md` | Agent-only modification rules and review checklist                                         |

Keep route-local `README.md` headings. When a heading links a `reference-*.md` leaf, update that
leaf for endpoint-specific details; otherwise the README's inline section is canonical.

## Route Map

| Area                    | Reference                                                                      | Notes                                          |
| ----------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| Admin topic imports     | [v1/admin/imports/README.md](./v1/admin/imports/README.md)                     | Admin-only bulk CSV imports                    |
| Agents                  | [v1/agents/README.md](./v1/agents/README.md)                                   | Agent viewer endpoints and moderation actions  |
| Attribution             | [v1/attribution/README.md](./v1/attribution/README.md)                         | Referral attribution tracking                  |
| Auth                    | [v1/auth/README.md](./v1/auth/README.md)                                       | Login, logout, email auth, Meta auth           |
| Captcha config          | [v1/captcha-config/README.md](./v1/captcha-config/README.md)                   | Staging Turnstile always-approve public signal |
| Conversations           | [v1/conversations/README.md](./v1/conversations/README.md)                     | Chat conversations and SSE streaming           |
| Crawlers                | [v1/crawlers/README.md](./v1/crawlers/README.md)                               | Crawler CRUD and refresh                       |
| Dynamic config          | [v1/dynamic-config/README.md](./v1/dynamic-config/README.md)                   | Runtime config namespaces and audit history    |
| Entity relations        | [v1/entity-relations/README.md](./v1/entity-relations/README.md)               | Follow, mute, block, and subscribe actions     |
| Feeds                   | [v1/feeds/README.md](./v1/feeds/README.md)                                     | Personalized post and RSS item feeds           |
| Hostnames               | [v1/hostnames/README.md](./v1/hostnames/README.md)                             | Hostname search and comparison                 |
| Households              | [v1/households/README.md](./v1/households/README.md)                           | Household CRUD and memberships                 |
| Images                  | [v1/images/README.md](./v1/images/README.md)                                   | Presigned upload flow                          |
| Individuals             | [v1/individuals/README.md](./v1/individuals/README.md)                         | Current user's individual profile              |
| Memberships             | [v1/memberships/README.md](./v1/memberships/README.md)                         | Plans, billing, and grants                     |
| MQ admin                | [v1/mq/README.md](./v1/mq/README.md)                                           | Queue monitoring and management                |
| My                      | [v1/my/README.md](./v1/my/README.md)                                           | Current-user cards, profile, rewards, spending |
| PostgreSQL admin        | [v1/psql/README.md](./v1/psql/README.md)                                       | Migrations, partitions, materialized views     |
| Posts                   | [v1/posts/README.md](./v1/posts/README.md)                                     | Post CRUD, ratings, search, descendants        |
| Recommended topics      | [v1/recommended-topics/README.md](./v1/recommended-topics/README.md)           | Personalized topic suggestions                 |
| Referral links          | [v1/referral-links/README.md](./v1/referral-links/README.md)                   | Link CRUD, validations, click attribution      |
| RSS feed items          | [v1/rss-feed-items/README.md](./v1/rss-feed-items/README.md)                   | Search and detail                              |
| RSS feeds               | [v1/rss-feeds/README.md](./v1/rss-feeds/README.md)                             | Feed CRUD, refresh, crawl history              |
| Sessions authentication | [v1/sessions-authentication/README.md](./v1/sessions-authentication/README.md) | Session lifecycle, passkeys, OAuth             |
| Topic recommendations   | [v1/topic-recommendations/README.md](./v1/topic-recommendations/README.md)     | Logged-in recommendation queue                 |
| Topics                  | [v1/topics/README.md](./v1/topics/README.md)                                   | Topic detail, search, discovery                |
| Trending topics         | [v1/trending-topics/README.md](./v1/trending-topics/README.md)                 | Trending discovery                             |
| URLs                    | [v1/urls/README.md](./v1/urls/README.md)                                       | URL detail, search, crawl management           |
| Users                   | [v1/users/README.md](./v1/users/README.md)                                     | User profiles, collections, suspension         |
| Valkey admin            | [v1/valkey/README.md](./v1/valkey/README.md)                                   | Cache and bloom filter rebuild admin           |
| Vote integrity          | [v1/vote-integrity/README.md](./v1/vote-integrity/README.md)                   | Review queue and flag resolution               |
| RSS XML                 | [../rss/README.md](../rss/README.md)                                           | Mounted at `/rss/`, not `/api/v1/`             |

## Route Helpers

Use `response-helpers.mts` for standard route preambles:

- `requireAuth(ctx, routeId)` resolves a required user, applies rate limiting, and returns
  `PrivateUser`.
- `getOptionalAuthAndRateLimit(ctx, routeId)` resolves an optional user, applies rate limiting, and
  returns `PrivateUser | null`.
- `requireAuthAndRateLimit(ctx, canFn, routeId)` resolves a required user, authorizes, and applies
  rate limiting, returning `PrivateUser`.
- `validateUUIDParam(ctx, name)` validates a UUID route parameter and throws 422 when invalid.
- `parseJsonBody<T>(ctx, maxSize?)` parses a bounded JSON body, defaulting to `1mb`. Api-server
  rejects non-JSON media types for body-bearing mutation routes unless the route declares an
  explicit accepted-media-type exception. Enforcement is body-bearing only, so bodyless mutations
  pass through without a `Content-Type` header.

Generated request contracts are available to route-family migrations through
`@services/runtime-request-validation`. Callers must authenticate and authorize first, then
validate before the route invokes a service or writes state. This avoids leaking detailed schema
failures to unauthenticated callers. `api-fixtures/v1/openapi.json` and
`api-fixtures/v1/request-contracts.json` are sibling compiler-generated outputs; runtime code uses
only the latter. Routes with signature-verified or raw bodies keep their specialized parsers.

Route modification invariants live in [CLAUDE.md](CLAUDE.md).

## Response Patterns

### Wrapped responses

- Single entity: `{ post: { ... } }`
- Lists: `{ results: [...], page_info: { ... } }`
- Delete: `204 No Content`

Never return a raw entity or raw array at the top level.

### Election sidecars

Entity payloads must not include nested election summaries or raw election aggregate fields such as
`votes_score_net`, `votes_count_up`, or `votes_count_down`. Return election summaries as top-level
sidecar maps keyed by entity ID, for example `post_elections`, `topic_elections`,
`hostname_elections`, or `rss_feed_item_elections`. Detail endpoints may return a singular sidecar
field such as `post_election`, but it must still be fetched through cached batch helpers.

### Streaming lists

For streamed list responses:

- `results[]` contains refs only: `{ __entity_type, id }`
- entity payloads stream in separate keyed maps such as `posts`, `topics`, `users`
- promise-valued fields should be passed directly to `streamJsonObject()` from
  `@jongleberry/api-server`
- empty responses should still include the same top-level fields as the non-empty path

## Caching And Rate Limiting

| Concern            | Rule                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Route rate limits  | Every endpoint calls `ctx.applyRouteRateLimit('METHOD:/path')` unless explicitly exempted |
| Public GET caching | Logged-out, non-personalized GET responses set `Cache-Control` for Cloudflare caching     |
| Entity cache       | Single-entity lookups use `@services/entity-cache` getters                                |
| Search cache       | Logged-out list/search endpoints use `createSearchCache` wrappers where available         |

See [../../docs/overview/architecture/rate-limiting.md](../../docs/overview/architecture/rate-limiting.md) for the full rate-limit architecture.

## Performance Conventions

| Layer        | Mechanism                               | Scope                  |
| ------------ | --------------------------------------- | ---------------------- |
| HTTP Cache   | `Cache-Control` headers, Cloudflare CDN | Logged-out public GETs |
| Entity Cache | Valkey `*CachedBatch()` / `*Cached()`   | All entity reads       |
| Search Cache | Valkey `*Cached()` search wrappers      | Logged-out list/search |
| Streaming    | `streamJsonObject()` parallel promises  | All list responses     |

Each folder's `README.md` must retain a `## Performance` heading; `no-mistakes check` enforces its
presence. When that heading links `reference-performance.md`, the leaf owns the table documenting
round trips, caching, and query patterns per endpoint; otherwise the README's inline section does.

See [docs/requirements/platform/api-performance.md](../../docs/requirements/platform/api-performance.md) for the full
performance requirements.

## Types

- Canonical entity types live in [`backend/types/entities/`](../types/entities/) (`@voucha/types/entities/`)
- API response body types live in [`backend/api/types.mts`](types.mts)
- Shared pagination types come from `@voucha/types/pagination`
- Web API helpers should use concrete response types, not generic `<T>` wrappers

## Related

- Agent modification rules: [CLAUDE.md](./CLAUDE.md)
- Backend context: [../CLAUDE.md](../CLAUDE.md)
- Services: [../services/CLAUDE.md](../services/CLAUDE.md)
- Web requirements: [../../docs/requirements/README.md](../../docs/requirements/README.md)
- Security architecture: [API Server Runtime Controls](../../docs/requirements/security/reference-backend-defence-in-depth.md#api-server-runtime-controls)
