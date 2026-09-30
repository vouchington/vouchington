# API Routes

Source entrypoint: [backend/api/README.md](../../../backend/api/README.md)

HTTP API route reference for Voucha. Routes are thin controllers over `@services/*`.

## Route documentation

Keep route-local README headings. When a heading links a `reference-*.md` leaf, update that leaf
for endpoint-specific details; otherwise the README's inline section is canonical.

## Route Map

| Area                    | Reference                                                                                         | Notes                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Admin topic imports     | [v1/admin/imports/README.md](./v1/admin/imports/README.md)                                        | Admin-only bulk CSV imports                     |
| Agent moderation        | [v1/agents/README.md](./v1/agents/README.md)                                                      | Agent moderation actions                        |
| Attribution             | [v1/attribution/README.md](./v1/attribution/README.md)                                            | Referral attribution tracking                   |
| Auth                    | [v1/auth/README.md](./v1/auth/README.md)                                                          | Login, logout, email auth, Meta auth            |
| Captcha config          | [v1/captcha-config/README.md](./v1/captcha-config/README.md)                                      | Staging Turnstile always-approve public signal  |
| Conversations           | [v1/conversations/README.md](./v1/conversations/README.md)                                        | Chat conversations and SSE streaming            |
| Copyright notices       | [v1/copyright-notices/README.md](./v1/copyright-notices/README.md)                                | Notice, appeal, counter-notice, and review flow |
| Crawlers                | [v1/crawlers/README.md](./v1/crawlers/README.md)                                                  | Crawler CRUD and refresh                        |
| Dynamic config          | [v1/dynamic-config/README.md](./v1/dynamic-config/README.md)                                      | Runtime config namespaces and audit history     |
| Entity relations        | [v1/entity-relations/README.md](./v1/entity-relations/README.md)                                  | Follow, mute, block, and subscribe actions      |
| Feeds                   | [v1/feeds/README.md](./v1/feeds/README.md)                                                        | Personalized post and RSS item feeds            |
| Hostnames               | [v1/hostnames/README.md](../../../backend/api/v1/hostnames/README.md)                             | Hostname search and comparison                  |
| Households              | [v1/households/README.md](./v1/households/README.md)                                              | Household CRUD and memberships                  |
| Images                  | [v1/images/README.md](./v1/images/README.md)                                                      | Presigned upload flow                           |
| Individuals             | [v1/individuals/README.md](./v1/individuals/README.md)                                            | Current user's individual profile               |
| Memberships             | [v1/memberships/README.md](./v1/memberships/README.md)                                            | Plans, billing, and grants                      |
| MQ admin                | [v1/mq/README.md](./v1/mq/README.md)                                                              | Queue monitoring and management                 |
| OAuth authorization     | [oauth/README.md](./oauth/README.md)                                                              | OAuth 2.1 authorization server and consent      |
| My                      | [v1/my/README.md](./v1/my/README.md)                                                              | Current-user cards, profile, rewards, spending  |
| PostgreSQL admin        | [v1/psql/README.md](./v1/psql/README.md)                                                          | Migrations, partitions, materialized views      |
| Posts                   | [v1/posts/README.md](../../../backend/api/v1/posts/README.md)                                     | Post CRUD, ratings, search, descendants         |
| Recommended topics      | [v1/recommended-topics/README.md](./v1/recommended-topics/README.md)                              | Personalized topic suggestions                  |
| Referral links          | [v1/referral-links/README.md](./v1/referral-links/README.md)                                      | Link CRUD, validations, click attribution       |
| RSS feed items          | [v1/rss-feed-items/README.md](./v1/rss-feed-items/README.md)                                      | Search and detail                               |
| RSS feeds               | [v1/rss-feeds/README.md](../../../backend/api/v1/rss-feeds/README.md)                             | Feed CRUD, refresh, crawl history               |
| Sessions authentication | [v1/sessions-authentication/README.md](../../../backend/api/v1/sessions-authentication/README.md) | Session lifecycle, passkeys, OAuth              |
| Topic recommendations   | [v1/topic-recommendations/README.md](./v1/topic-recommendations/README.md)                        | Logged-in recommendation queue                  |
| Topics                  | [v1/topics/README.md](../../../backend/api/v1/topics/README.md)                                   | Topic detail, search, discovery                 |
| Trending topics         | [v1/trending-topics/README.md](./v1/trending-topics/README.md)                                    | Trending discovery                              |
| URLs                    | [v1/urls/README.md](./v1/urls/README.md)                                                          | URL detail, search, crawl management            |
| Users                   | [v1/users/README.md](../../../backend/api/v1/users/README.md)                                     | User profiles, collections, suspension          |
| Valkey admin            | [v1/valkey/README.md](./v1/valkey/README.md)                                                      | Cache and bloom filter rebuild admin            |
| Vote integrity          | [v1/vote-integrity/README.md](./v1/vote-integrity/README.md)                                      | Review queue and flag resolution                |
| RSS XML                 | [../rss/README.md](../../overview/architecture/backend/rss/README.md)                             | Mounted at `/rss/`, not `/api/v1/`              |

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
- `validateRequestContract(ctx, operation, input)` checks a route's path/body/query carriers
  against the generated contract for `operation` (`'METHOD:/path'`) and throws 422 with the
  registry's redacted message. Read [Request validation](reference-request-validation.md) for the
  required ordering, pure query projection, meaningful-schema, and compiler/HTTP coverage rules.

Route modification invariants live in [AGENTS.md](../../../backend/api/AGENTS.md).

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

- Rate-limit every endpoint unless explicitly exempted; use the [route helpers](#route-helpers).
- Logged-out, non-personalized GET responses set `Cache-Control` for Cloudflare caching.
- Single-entity reads use `@services/entity-cache`; logged-out list/search endpoints use `createSearchCache` where available.

See the [rate-limit architecture](../../overview/architecture/rate-limiting.md).

## Performance Conventions

- Public GETs use `Cache-Control` and Cloudflare CDN caching.
- Entity reads use Valkey `*CachedBatch()` / `*Cached()` helpers; logged-out list/search uses Valkey `*Cached()` wrappers.
- List responses stream parallel promises through `streamJsonObject()`.

Source route `README.md` files retain the required `## Performance` heading as a pointer to their
canonical endpoint documentation under `docs/requirements/api/**`. Those docs own round trips,
caching, and query patterns; keep source entrypoints short. See the [API performance requirements](../platform/api-performance.md).

## Types

- Canonical entity types live in [`backend/types/entities/`](../../../backend/types/entities/) (`@voucha/types/entities/`)
- API response body types live in [`backend/api/types.mts`](../../../backend/api/types.mts)
- Shared pagination types come from `@voucha/types/pagination`
- Web API helpers should use concrete response types, not generic `<T>` wrappers

## Related

- Agent modification rules: [AGENTS.md](../../../backend/api/AGENTS.md)
- Backend context: [../AGENTS.md](../../../backend/AGENTS.md)
- Services: [../services/AGENTS.md](../../../backend/services/AGENTS.md)
- Web requirements: [../../docs/requirements/README.md](../README.md)
- Security architecture: [API Server Runtime Controls](../security/reference-backend-defence-in-depth.md#api-server-runtime-controls)

## Reference index

- [App Attestation API](../../../backend/api/v1/app-attestation/README.md)
- [App Attestation API](v1/app-attestation/README.md)
- [Content, list, household and public user route request validation](reference-content-routes-request-validation.md)
