# Elections & Votes Service

Config-driven service for managing election voting across 7 entity types.

## Architecture

### Entity Types

| Entity           | Vote Table               | Config                                                       | Client API                                          |
| ---------------- | ------------------------ | ------------------------------------------------------------ | --------------------------------------------------- |
| Post             | `post_votes`             | [`post/config.mts`](post/config.mts)                         | `PUT` / `DELETE /api/v1/posts/:id/vote`             |
| Topic            | `topic_votes`            | [`topic/config.mts`](topic/config.mts)                       | `PUT` / `DELETE /api/v1/topics/:id/vote`            |
| Hostname         | `hostname_votes`         | [`hostname/config.mts`](hostname/config.mts)                 | `PUT` / `DELETE /api/v1/hostnames/:id/vote`         |
| Entity Relation  | `entity_relation_votes`  | [`entity-relation/config.mts`](entity-relation/config.mts)   | `PUT` / `DELETE /api/v1/entity-relations/:id/vote`  |
| Agent Moderation | `agent_moderation_votes` | [`agent-moderation/config.mts`](agent-moderation/config.mts) | `PUT` / `DELETE /api/v1/agent-moderations/:id/vote` |
| RSS Feed Item    | `rss_feed_item_votes`    | [`rss-feed-item/config.mts`](rss-feed-item/config.mts)       | `PUT` / `DELETE /api/v1/rss-feed-items/:id/vote`    |
| User Vouch       | `user_vouch_votes`       | [`user-vouch/config.mts`](user-vouch/config.mts)             | `PUT` / `DELETE /api/v1/users/:id/vouch-vote`       |

`entity_relation_votes` is an append-only list-partitioned parent. Each election-capable relation
has its own generated `<relation_table>__votes` partition with a composite foreign key on
`(subject_id, entity_relation_id)`, so relation partition pruning and target deletion are enforced
without changing the vote API.

### Shared Factories ([`shared/`](shared/))

- **`entity-service.mts`** — Service-layer factories: `createVotesUpsert`, `createVotesGetByUser`, `createElectionGetter`, `createElectionBatchGetter`, `createVotesGetByElectionId` (paginated admin vote-history: `{ limit, after? }` → `{ results, page_info }`), `createVotesGetByUserForEntity` (paginated single-user vote-history for the same endpoints' non-admin branch)
- **`vote-queries.mts`** — Raw keyset-paginated vote-row queries: `fetchElectionVoteRowsByUser` (id-keyset over the entity ID, used by the user-branch and by unbounded non-route callers when `pagination` is omitted) and `fetchElectionVoteRowsByEntityId` (id-keyset over `user_id`, always paginated; the admin vote-history read path). Both fetch `limit + 1` raw rows so route handlers can derive `has_next_page` before mapping with `mapCurrentVotes()`.
- **`vote-route-utils.mts`** — Route utilities: semantic-choice validation and rate-limit keys
- **`types.mts`** — Shared types: `ElectionVoteChoice`, `ViewBaseElection`, `ElectionVote`

### Route Handler Factory ([`backend/api/election-vote-handler.mts`](../../api/election-vote-handler.mts))

All seven PUT vote endpoints and their DELETE clear routes use the shared handlers to eliminate
boilerplate. The handlers cover:

- Content-type and UUID validation
- Authentication
- Contribution checks: verified non-disposable email for free users, while vote endpoints bypass the 7-day account-age contribution gate
- Entity existence check
- Optional access control (`preAssertAccess` before entity lookup, `assertAccess` after)
- Rate limiting (31 requests/60s per user/IP/device/session)
- Body validation against the entity policy
- Append-only vote upsert, or a `NULL` Clear event, then a 204 response

```typescript
import { createVoteHandler } from '../../election-vote-handler.mts'

const handleTopicVote = createVoteHandler({
  rateLimitPrefix: 'topic-election-vote',
  upsertVotes: upsertTopicElectionVotes,
  getEntity: getTopicByAnyCached,
  entityNotFoundMessage: 'Topic not found',
})

app.route('/api/v1/topics/:id/vote').put(handleTopicVote).delete(handleTopicVoteClear)
```

For routes with custom access checks (posts, admin moderation), use `assertAccess`:

```typescript
const handlePostVote = createVoteHandler({
  rateLimitPrefix: 'post-election-vote',
  upsertVotes: upsertPostElectionVotes,
  getEntity: async id => {
    const post = await getPostByAnyCached(id)
    if (!post) return null
    return getRouteAccessPost(post)
  },
  entityNotFoundMessage: 'Post not found',
  assertAccess: async (ctx, currentUser, entity) => {
    ctx.assert(await canViewPost(currentUser, entity), 404, 'Post not found')
  },
})
```

### Caching

### Vote policies and state

Clients send `{ "choice": "..." }`, never a numeric score. Sentiment elections for posts,
comments, RSS items, topics, domains, and user trust accept `vouch` (+2), `like` (+1), `neutral`
(0), `dislike` (-1), and `disavow` (-2). Recommendation elections accept `support` / `oppose`,
relation elections accept `confirm` / `dispute`, and moderation elections accept `accurate` /
`inaccurate`.

Public viewers retract a sentiment ballot in the UI by `PUT` `neutral`. Neutral is scored
(`votes_count_none` / `votes_score_none` and the Wilson denominator). Neutral is rejected when the
viewer has no current ballot. Binary policies have no Neutral and no Neutral retract: the viewer
can only switch sides. `DELETE` Clear remains available (unscored `NULL`) for clients and official
accounts that still send it; public UIs hide Clear and use Neutral instead. Historical Clear rows
stay no-ballot and are not backfilled to Neutral. Aggregation retains score magnitude for the net
score, and count buckets remain sign-based. Public clients render counts only; the aggregate net
score remains available through the API. Existing down-count access control remains in force.

Elections are cached in Valkey with 5-minute TTL via `@services/entity-cache`. API read paths must
use the cached batch helpers (`getPostElectionByIdCachedBatch`,
`getTopicElectionByIdCachedBatch`, `getHostnameElectionByIdCachedBatch`,
`getRssFeedItemElectionByIdCachedBatch`, etc.) even when returning a singular detail sidecar. Raw
`get*ElectionById` helpers are for service internals, tests, and cache refresh sources.

Election summaries are response sidecars, not entity fields. List endpoints return keyed maps such
as `post_elections`, `topic_elections`, `hostname_elections`, or `rss_feed_item_elections`; detail
endpoints may return a singular sidecar such as `post_election`. Do not add nested `election`
objects or raw vote aggregate fields to entity VIEW payloads.

### Vote Aggregate Consistency

Vote aggregates (`votes_count_*`, `votes_score_*`) are **eventually consistent**, not
read-after-write. A `PUT`/`DELETE` vote enqueues the recompute fire-and-forget
(`void options.enqueueElectionStats(entityIds)` in `shared/entity-service.mts`) and returns `204`
before it runs; the recompute itself is deliberately scheduled
`ELECTIONS_DEFAULTS.recomputeDelayMs` (6s in production) after the vote so it lands outside normal
request latency and reads the **replica** rather than the primary (#7352). (The Vitest glide-mq shim
ignores `delay`, so the recompute lands inside request latency in tests only — which is why tests
need the waiter below and production needs no change.) Callers and tests must not assume a `GET`
immediately after a vote reflects that vote.

Each aggregate carries the PostgreSQL MVCC snapshot marker captured by the same SQL statement:
the epoch-aware snapshot `xmax` and the number of transactions still in progress below it. Entity
updates accept a greater `xmax`, or an equal `xmax` with no more in-progress transactions. This
prevents an older replica snapshot from overwriting a newer aggregate even when a lower UUIDv7 vote
commits later, a voter weight changes, a voter is deleted, or the aggregate contains zero votes.
The marker is a write-ordering fence, not a replica-lag reconciler: if the last scheduled recompute
itself reads before replication catches up, no later recompute is currently guaranteed (#11113).

Tests that vote then read the recomputed aggregate must wait for the recompute job first, using
`onceElectionVoteStatsCompleted` from `backend/workers/elections/test-support.mts`:

```typescript
await request.put(`/api/v1/posts/${postId}/vote`).send({ choice: 'dislike' }).expect(204)
await onceElectionVoteStatsCompleted(postId)
// the vote-count aggregate has now been recomputed for this post
```

This service's own test files (e.g. `post/votes-upsert.generated.test.mts`,
`topic/votes-upsert.generated.test.mts`, `agent-moderation/votes-upsert.generated.test.mts`,
`user-vouch/votes-upsert.test.mts`) cannot import `onceElectionVoteStatsCompleted` — `@workers/elections`
already depends on `@services/elections-votes` (`workers.mts`'s `processElection` calls the
per-entity-type update functions directly), and `pnpm-workspace.yaml` sets
`disallowWorkspaceCycles: true`, so the reverse import would be a forbidden cycle. Those files keep
their local polling helpers; only callers outside `@services/elections-votes` (routes, other
services) can use the shared waiter.

### Adding a New Votable Entity

1. Create config in `backend/services/elections-votes/<entity>/config.mts`
2. Create service functions using shared factories in `entity-service.mts`
3. Create the vote route using `createVoteHandler()` in the API route file
4. Add cached getters in `@services/entity-cache` if needed

## Related

- Agent rules for this directory: [CLAUDE.md](CLAUDE.md)
- [Elections System](../../queues/elections/README.md) — scheduled vote tally refresh and cache invalidation
- [Vote Integrity Service](../vote-integrity/README.md) — vote manipulation detection
- [Vote Weight Service](../vote-weight/README.md) — vote weight calculation
