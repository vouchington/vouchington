# Bookmarks

User bookmark system for saving, following, muting, blocking, and hiding entities. Built on top of entity relations with a Valkey bloom filter optimization for fast existence checks.

User-facing management surfaces for every user-subject bookmark relation are listed in the
[User Relation Matrix](../../requirements/users/USER-RELATION-MATRIX.md).

## What Are Bookmarks

Bookmarks are entity relations where the subject is a `user` and the predicate has `is_bookmark: true`. They represent personal user actions on entities.

This table is generated from every `entityRelationMetadatum` row where `subject_type === 'user'` and
`is_bookmark === true` (`backend/services/entity-relations/metadata.mts`) — 11 predicates across 26
`subject × predicate × object` relation tables total.

| Action                     | Applicable Entity Types             | Purpose                                                                                        |
| -------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `follow`                   | post, topic, user, rss_feed         | Follow for feed inclusion; following a `user` also auto-casts a Like (+1) trust signal (#7257) |
| `save`                     | post, rss_feed_item, url, community | Save for later                                                                                 |
| `hide`                     | post, rss_feed_item                 | Hide from feeds                                                                                |
| `mute`                     | topic, user, rss_feed, url_hostname | Mute from feeds (soft)                                                                         |
| `block`                    | topic, user, url_hostname           | Block bidirectionally (`user`) / block all content from a domain (`url_hostname`)              |
| `subscribe`                | post, user, rss_feed                | Subscribe for notifications                                                                    |
| `dismiss_recommendation`   | topic, user                         | Dismiss from recommendation queue                                                              |
| `subscribe_posts`          | topic                               | Notify when new posts are added to this topic (backend active; UI removed #6223)               |
| `subscribe_rss_feed_items` | topic                               | Notify when new RSS items are published for this topic (backend active; UI removed #6223)      |
| `proxy_follow`             | community                           | Apply `follow` to every entity in the community list                                           |
| `proxy_mute`               | community                           | Apply `mute` to every entity in the community list                                             |

## Implicit Unfollow

When a user mutes or blocks an entity, the system automatically removes any active follow on that same entity. This keeps feed intent congruent: if you mute or block something, it should not appear in your feed.

| Action       | Entity      | Also removes   |
| ------------ | ----------- | -------------- |
| `mute`       | `topic`     | `follow`       |
| `mute`       | `rss_feed`  | `follow`       |
| `block`      | `topic`     | `follow`       |
| `block`      | `user`      | `follow`       |
| `proxy_mute` | `community` | `proxy_follow` |

Muting a **user** does not remove the follow. Users may want to stay connected (e.g. appear in each other's follower counts) while suppressing notifications.

The unfollow is a no-op when no active follow exists — the delete is guarded by `AND deleted_at IS NULL`.

Implemented in `backend/services/bookmarks/upsert.mts` via the `IMPLICIT_UNFOLLOW` map in `bookmarkEntity()`.

## Implicit Vouch

Following a **user** auto-casts a Like (`+1`) for that user (issue #7257), mirroring how Disavow
auto-mutes and auto-unfollows (see [`backend/services/elections-votes/user-vouch/README.md`](../../../backend/services/elections-votes/user-vouch/README.md)).
This is one-directional: unfollowing does not retract the vouch. The vouch cast is best-effort — a
failure is logged via `onError` and does not fail the follow.

The cast is skipped (the follow still succeeds) when the follower is an official account
(`isOfficialAccount`) or is not contribution-eligible (`getContributionStatus`, skipping the
account-age gate) — see [Trust System overview § Mechanics (Official-account exclusion)](../../requirements/trust-safety/reference-trust-system-overview.md#mechanics).
The cast deliberately does **not** consume the shared daily contribution quota
(`@services/contribution-gating`): quota throttles the volume of deliberate contribution actions
(posts, votes), and folding an incidental follow side-effect into that shared counter would starve
an active follower's unrelated contributions for the rest of the day.

The `bookmarks` PUT route has no per-route rate limiting (unlike the explicit vouch-vote route), so
the cast is throttled independently: a `RateLimiter` (`@data-stores/valkey-rate-limiter`) under a
dedicated `'user-follow-vouch-cast'` prefix caps casts at 31 per 60 seconds per follower
(`uid:<userId>`). This is a separate budget from the explicit vouch-vote route's own
`'user-vouch-election-vote'` limiter — sharing one bucket would let a burst of follows exhaust the
budget a user needs to cast an explicit disavow. When the limit is hit, the cast is skipped and the
follow still succeeds.

Implemented in `backend/services/bookmarks/upsert.mts` in the `predicate === 'follow'` branch of `bookmarkEntity()`.

## Bloom Filter Optimization

Bookmark existence checks are performance-critical (every feed page checks bookmarks for all displayed entities across multiple relation types). A Valkey bloom filter provides fast negative lookups.

### How It Works

1. **Check bloom filter**: For each entity, check `{predicate}:{objectId}` in the user's bloom filter
2. **If bloom says "not present"**: Skip the DB query (guaranteed correct -- no false negatives)
3. **If bloom says "maybe present"**: Query the DB to confirm (handles false positives)
4. **If bloom is not ready**: Fall back to DB queries and enqueue a backfill job

### Key Details

- **One filter per user**: `bloom-filter:user-bookmarks:{userId}` (the `bloom-filter:` prefix and `:building` staging key are managed by the shared `ValkeyBloomFilter` class) stores all bookmark predicates
- **Ready keys**: Separate Valkey keys (`bookmark-bloom-ready:{userId}:{tableName}`) signal that the filter is populated. This avoids using the bloom filter itself for readiness (which would have false positives). Bookmark reads check relation ready markers, the per-user filter, and candidate entries in one Lua roundtrip, so unready relations fall back to PostgreSQL independently from ready relations.
- **Capacity**: `max(2,500, 2x current count + 1)` (`BOOKMARK_BLOOM_DEFAULT_CAPACITY`). The 2,500 floor was chosen empirically over the previous 10,000: measured against a local `valkey-bloom` instance (`BF.RESERVE`/`BF.INFO`/`MEMORY USAGE`), a fresh filter costs ~3.3KB at 2,500 versus ~12.3KB at 10,000 (73% less), and a simulated 2,000-item power user (bookmarks span 11 predicates sharing one per-user filter) still fits in a single sub-filter with zero `BF.MADD`-triggered scale-out. A 1,000 floor was rejected: exceeding it forces a second sub-filter via `BF.RESERVE`'s `expansionRate=2`, nearly tripling memory and doubling lookup cost.
- **Error rate**: 1% (`0.01`)
- **TTL on ready keys**: 7 days (`BOOKMARK_BLOOM_READY_TTL_SECONDS`) — refreshed on every successful backfill, so this only matters if backfills stop entirely for a user
- **TTL on the live filter key**: 8 days (`BOOKMARK_BLOOM_FILTER_TTL_SECONDS`), set in the same `Batch` as the ready-key refresh (no extra roundtrip). Not safety-critical on its own — `check-bloom-candidates.lua` gates every read on `EXISTS(filterKey)`, so an expired filter key always degrades to `ready: false` (PostgreSQL fallback) with zero false negatives. It exists to bound leaked memory on the shared `noeviction` Valkey instance if a filter stops being refreshed (e.g. a lost delete-on-user-deletion job, see below). `rebuildFromStream()` atomically `RENAME`s the finished build over the live key _before_ that `Batch` runs, so a process death in between would otherwise leave the live key with no TTL at all; a boot-time sweep (`sweepBookmarkBloomFiltersMissingTtl` in `@services/bloom-filter-maintenance`, backed by `expireBookmarkBloomFiltersMissingTtl` in `@data-stores/valkey`) backstops that window with the same `EXPIRE ... NX` pattern used for orphaned `:building` keys, so no live key can outlive the TTL regardless of how it came to exist (#8774)
- **Dual-write**: Bloom entries are added on every bookmark, even when reads are disabled, keeping the filter current across flag flips
- **No per-item deletion support**: Bloom filters cannot remove individual entries. Unbookmarked items remain as false positives until the next rebuild.
- **Deleted on user deletion**: `deleteUser` enqueues `processDeleteUserBookmarkBloomFilter` (fire-and-forget, `@queues/bloom-filters`), which idempotently `UNLINK`s the live filter key together with all 26 per-relation ready keys (`deleteUserBookmarkBloomFilter`). If that job is ever lost, the filter-key TTL above still reclaims the memory within 8 days.
- **Backfill fenced against deletion**: `backfillUserBookmarkBloomFilter` shares its `bookmark:{userId}` ordering key with the delete job (`ordering.concurrency: 1`), which only guarantees the two never run concurrently, not that a backfill enqueued moments before a user deletes their account can't run _after_ the delete job. `backfillUserBookmarkBloomFilter` therefore checks `isUserActive(userId)` (`@services/users`) first; for a soft-deleted user it calls the idempotent `deleteUserBookmarkBloomFilter` instead of rebuilding, so a stray backfill also cleans up residue left by a lost delete job rather than recreating the filter (#8775).
- **Feature flag**: `bookmarkBloomFilterEnabled` in dynamic config controls whether reads use the bloom filter

### Backfill

When a bloom filter is not ready, a background job (`enqueueBackfillUserBookmarkBloomFilter`) rebuilds it by streaming all bookmark relations from the DB in batches of 5,000. The backfill no-ops (and opportunistically cleans up) for a soft-deleted user — see the "Backfill fenced against deletion" bullet above.

## Bookmark Counts

- `getUserBookmarkCounts(userId)` -- counts of entities bookmarked by the user, grouped by entity type and predicate
- `getTopicBookmarkCounts(entityId)` / `getPostBookmarkCounts(entityId)` / `getRssFeedBookmarkCounts(entityId)` -- how many users bookmarked a given entity

## Related Services

- [Backend rules](../../../backend/CLAUDE.md) — service and data conventions
- [Web rules](../../../web/CLAUDE.md) — UI and routing conventions

- [backend/services/bookmarks/README.md](../../../backend/services/bookmarks/README.md) -- upsert, get, bloom filter, counts
- [backend/services/entity-relations/README.md](../../../backend/services/entity-relations/README.md) -- underlying relation storage
- [backend/queues/bloom-filters/README.md](../../../backend/queues/bloom-filters/README.md) -- backfill job queue
- [backend/api/v1/entity-relations/README.md](../../../backend/api/v1/entity-relations/README.md) -- bookmark API endpoints
