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

RSS XML is mounted outside `/api/v1`; see [RSS](../../overview/architecture/backend/README.md).

See the [API performance requirements](../platform/api-performance.md) and
[backend API instructions](../../../backend/api/AGENTS.md).
