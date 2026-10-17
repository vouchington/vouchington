# API Design Decisions

Routes, request schemas and limits are read from `backend/api/**` and the generated request
contracts. This page records only the decisions code cannot show.

## Route helpers

- Status precedence is deliberate: the rate limiter's 429 (also for anonymous callers) comes before
  the 401, then the signature error, then suspension. The limiter charges while the user is
  fetched, so they are one serial step.
- Authorization runs before the limiter, so forbidden requests are not charged.
- Body-bearing mutations accept only JSON unless a route declares an exception. Bodyless mutations
  need no `Content-Type`.
- Request validation runs through the generated contract, so a malformed body is a 422 and never a 500.

## Response patterns

- Never return a raw entity or raw array at the top level. Wrap single entities, and wrap lists as
  `{ results, page_info }`.
- Entity payloads carry no nested election summaries or raw vote aggregates. Elections are
  top-level sidecar maps keyed by entity id, fetched through the cached batch helpers.
- Streamed lists return refs only in `results[]`; entity payloads stream in separate keyed maps.
  Empty responses keep the same top-level fields.

## Enumeration and disclosure

- Missing and not-owned private resources return 404, so ids cannot be probed.
- Passkey sign-in failures are one generic 401 for unknown credential and failed verification.
- Rate-limited attribution calls silently succeed so limits are not an oracle.
- Post creation rejections never reveal quota thresholds, Safety policy, or moderation state.
- Topic deletion is unsupported on purpose; merges are the only way to retire a topic.
- The staff reply to a copyright counter-notice is intentionally not replay-safe, so staff are
  never led to believe a repeated action succeeded.

## Federation and OAuth

- ActivityPub discovery, actor and WebFinger routes and the Bluesky client-metadata route are
  anonymous by design and skip the session preamble.
- Actor identity is UUID-only; usernames appear only in WebFinger.
- Federation is per-user opt-in; an opted-out user has no reachable actor.
- Remote Likes land in an isolated ledger and never in `post_votes`, so a remote actor can never
  move local ranking.
- The inbox verifies the HTTP signature, then requires the activity's actor to match the signer.
- OAuth `/register`, `/token` and `/revoke` are machine-to-machine; `/authorize` is a browser route
  and keeps the ordinary session boundary. `/token` rejects a `resource` that is not the grant's
  bound resource.

## Route entrypoints

Each route directory keeps a short README that only points at the performance requirements, because
a repository guard requires the `## Performance` heading. RSS XML is mounted outside `/api/v1`; see
[RSS](../../overview/architecture/backend/README.md).

- [README.md](../../../backend/api/README.md)
- [activitypub/README.md](../../../backend/api/activitypub/README.md)
- [bluesky/README.md](../../../backend/api/bluesky/README.md)
- [catalog/README.md](../../../backend/api/catalog/README.md)
- [oauth/README.md](../../../backend/api/oauth/README.md)
- [v1/admin/README.md](../../../backend/api/v1/admin/README.md)
- [v1/admin/growth-metrics/README.md](../../../backend/api/v1/admin/growth-metrics/README.md)
- [v1/admin/imports/README.md](../../../backend/api/v1/admin/imports/README.md)
- [v1/admin/rss-feed-categories/README.md](../../../backend/api/v1/admin/rss-feed-categories/README.md)
- [v1/agents/README.md](../../../backend/api/v1/agents/README.md)
- [v1/app-attestation/README.md](../../../backend/api/v1/app-attestation/README.md)
- [v1/appeals/README.md](../../../backend/api/v1/appeals/README.md)
- [v1/attribution/README.md](../../../backend/api/v1/attribution/README.md)
- [v1/auth/README.md](../../../backend/api/v1/auth/README.md)
- [v1/availability/README.md](../../../backend/api/v1/availability/README.md)
- [v1/blacklist/README.md](../../../backend/api/v1/blacklist/README.md)
- [v1/bookmarks/README.md](../../../backend/api/v1/bookmarks/README.md)
- [v1/captcha-config/README.md](../../../backend/api/v1/captcha-config/README.md)
- [v1/communities/README.md](../../../backend/api/v1/communities/README.md)
- [v1/conversations/README.md](../../../backend/api/v1/conversations/README.md)
- [v1/copyright-notices/README.md](../../../backend/api/v1/copyright-notices/README.md)
- [v1/countries/README.md](../../../backend/api/v1/countries/README.md)
- [v1/crawlers/README.md](../../../backend/api/v1/crawlers/README.md)
- [v1/curated-aside-items/README.md](../../../backend/api/v1/curated-aside-items/README.md)
- [v1/currencies/README.md](../../../backend/api/v1/currencies/README.md)
- [v1/disputes/README.md](../../../backend/api/v1/disputes/README.md)
- [v1/dynamic-config/README.md](../../../backend/api/v1/dynamic-config/README.md)
- [v1/entity-relations/README.md](../../../backend/api/v1/entity-relations/README.md)
- [v1/feature-flags/README.md](../../../backend/api/v1/feature-flags/README.md)
- [v1/fediverse/README.md](../../../backend/api/v1/fediverse/README.md)
- [v1/feeds/README.md](../../../backend/api/v1/feeds/README.md)
- [v1/friend-recommendations/README.md](../../../backend/api/v1/friend-recommendations/README.md)
- [v1/hostnames/README.md](../../../backend/api/v1/hostnames/README.md)
- [v1/households/README.md](../../../backend/api/v1/households/README.md)
- [v1/images/README.md](../../../backend/api/v1/images/README.md)
- [v1/individuals/README.md](../../../backend/api/v1/individuals/README.md)
- [v1/landing-pages/README.md](../../../backend/api/v1/landing-pages/README.md)
- [v1/lists/README.md](../../../backend/api/v1/lists/README.md)
- [v1/localization/README.md](../../../backend/api/v1/localization/README.md)
- [v1/markdown/README.md](../../../backend/api/v1/markdown/README.md)
- [v1/mcp/README.md](../../../backend/api/v1/mcp/README.md)
- [v1/memberships/README.md](../../../backend/api/v1/memberships/README.md)
- [v1/mq/README.md](../../../backend/api/v1/mq/README.md)
- [v1/my/README.md](../../../backend/api/v1/my/README.md)
- [v1/my/aside-preferences/README.md](../../../backend/api/v1/my/aside-preferences/README.md)
- [v1/platform-stats/README.md](../../../backend/api/v1/platform-stats/README.md)
- [v1/podcast-episodes/README.md](../../../backend/api/v1/podcast-episodes/README.md)
- [v1/posts/README.md](../../../backend/api/v1/posts/README.md)
- [v1/psql/README.md](../../../backend/api/v1/psql/README.md)
- [v1/recommended-topics/README.md](../../../backend/api/v1/recommended-topics/README.md)
- [v1/referral-links/README.md](../../../backend/api/v1/referral-links/README.md)
- [v1/report-integrity/README.md](../../../backend/api/v1/report-integrity/README.md)
- [v1/reports/README.md](../../../backend/api/v1/reports/README.md)
- [v1/rss-feed-items/README.md](../../../backend/api/v1/rss-feed-items/README.md)
- [v1/rss-feeds/README.md](../../../backend/api/v1/rss-feeds/README.md)
- [v1/scopes/README.md](../../../backend/api/v1/scopes/README.md)
- [v1/search/README.md](../../../backend/api/v1/search/README.md)
- [v1/sessions-authentication/README.md](../../../backend/api/v1/sessions-authentication/README.md)
- [v1/stories/README.md](../../../backend/api/v1/stories/README.md)
- [v1/topic-recommendations/README.md](../../../backend/api/v1/topic-recommendations/README.md)
- [v1/topics/README.md](../../../backend/api/v1/topics/README.md)
- [v1/trending-communities/README.md](../../../backend/api/v1/trending-communities/README.md)
- [v1/trending-posts/README.md](../../../backend/api/v1/trending-posts/README.md)
- [v1/trending-referral-programs/README.md](../../../backend/api/v1/trending-referral-programs/README.md)
- [v1/trending-topics/README.md](../../../backend/api/v1/trending-topics/README.md)
- [v1/urls/README.md](../../../backend/api/v1/urls/README.md)
- [v1/users/README.md](../../../backend/api/v1/users/README.md)
- [v1/valkey/README.md](../../../backend/api/v1/valkey/README.md)
- [v1/vote-integrity/README.md](../../../backend/api/v1/vote-integrity/README.md)
- [v1/web-search/README.md](../../../backend/api/v1/web-search/README.md)

See the [API performance requirements](../platform/api-performance.md) and
[backend API instructions](../../../backend/api/AGENTS.md).
