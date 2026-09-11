# Entity Relations

See also: [Entity × Action Matrix](../../requirements/ENTITY-ACTION-MATRIX.md) — how predicates map to UI actions on every surface. [Entity × Lifecycle Flow Matrix](../../requirements/ENTITY-LIFECYCLE-MATRIX.md) — lifecycle flows per entity with authorization tiers. [User Relation Matrix](../../requirements/users/USER-RELATION-MATRIX.md) — user profile management surfaces for bookmark relations.

A config-driven system for managing many-to-many and one-to-many relationships between entities as a directed weighted graph. Each relation type gets its own PostgreSQL table, generated automatically from configuration.

## Semantics

Relations follow a sentence structure: `[Subject] [Predicate] [Object]`. The subject is the primary entity (optimized for querying), and the predicate describes the relationship.

Examples:

- `User -> follow -> User` (following system)
- `User -> save -> Post` (bookmarks)
- `Post -> related -> Topic` (content tagging)
- `Topic -> faq -> Post` (FAQ ranking)

## Entity Types

`user`, `post`, `topic`, `rss_feed`, `rss_feed_item`, `url`, `image`, `card`, `rewards_program`, `rewards_program_status`, `referral_program`, `review`, `discussion`, `community`

## Predicate Types

| Predicate                | Election | Bookmark | Bidirectional | Description                           |
| ------------------------ | -------- | -------- | ------------- | ------------------------------------- |
| `follow`                 | No       | Yes      | No            | User follows an entity                |
| `save`                   | No       | Yes      | No            | User saves/bookmarks an entity        |
| `hide`                   | No       | Yes      | No            | User hides an entity from feeds       |
| `mute`                   | No       | Yes      | No            | User mutes an entity from feeds       |
| `block`                  | No       | Yes      | No            | User blocks an entity bidirectionally |
| `subscribe`              | No       | Yes      | No            | User subscribes for notifications     |
| `related`                | Yes      | No       | Yes           | Entities are related to each other    |
| `category`               | Yes      | No       | No            | Entity is categorized under another   |
| `faq`                    | Yes      | No       | No            | Entity is an FAQ for another          |
| `guide`                  | Yes      | No       | No            | Entity is a guide for another         |
| `landing_page`           | Yes      | No       | No            | URL is a landing page for a topic     |
| `terms_of_service`       | Yes      | No       | No            | URL is ToS for a topic                |
| `mentioned`              | No       | No       | No            | Entity is mentioned in another        |
| `dismiss_recommendation` | No       | Yes      | No            | User dismissed a recommendation       |

User moderation tags reuse the election-backed `category` predicate as
`User → category → Topic`. The allowed topic objects are a closed catalog (`Bot`, `Spammer`), and
the generic entity-relations API admits only this exact user-subject tuple. Personal user-subject
relations such as follow, mute, and block remain bookmark API concerns.

## Table Structure

- Table naming: `relation__<subject>__<predicate>__<object>` (e.g. `relation__user__follow__user`)
- User-subject relation tables (`relation__user__*`) are **not partitioned** (under 1M rows threshold), using plain B-tree indexes. They were previously HASH-partitioned by `subject_id` and caused reverse-lookup fan-out (see below); HASH partitioning is now forbidden repo-wide — see [partitioning-strategy.md](partitioning-strategy.md)
- Tables are created automatically from the config via idempotent migrations
- No destructive actions on config removal -- unused tables persist but are no longer referenced

## Privacy Filter Integration

`buildPrivacyFilter()` in `backend/services/posts/privacy-filter.mts` uses entity relation tables to enforce post visibility in feeds and search. It checks follow relationships via `relation__user__follow__user` to determine broadcast audience access. Since these tables use plain B-tree indexes, the reverse lookup hits a single index scan — previously, when this table was hash-partitioned by `subject_id`, this same `object_id` lookup scanned all 8 partitions 5+ times per feed query. See [backend/services/feeds/README.md](../../../backend/services/feeds/README.md#performance).

## Side Effects

`upsertEntityRelation` has the following side effects beyond writing the relation row:

- **Election vote stats** — standalone election-backed writes cast the upvote in-process, then enqueue the elections vote-stats worker. A caller-supplied transaction writes the vote and refreshes `votes_score_net` on that same transaction; the owning transaction wrapper invalidates changed election-cache entries after commit, so no worker observes uncommitted rows. A process failure in that post-commit gap leaves at most the normal five-minute election-cache TTL. Production callers that filter on `votes_score_net > 0` (public topic metrics, viewer-aware topic counts, feed eligibility, search) can rely on committed transactional writes; asynchronous standalone writes still wait for the worker. Tests that only need eligible fixture state use `relatePostToTopic` from `@voucha/test-helpers`, which inserts the final scored relation directly without service or worker side effects.
- **Notification reconcile** — `enqueueNotificationReconcileForRelations` is called for every successful upsert.
- **Follow notifications** — `enqueueBulkFollowNotification` fires for `user → follow → user` relations.
- **URL crawl** — `enqueueBulkCrawlUrls` fires for any relation whose `object_type === 'url'`, ensuring the linked URL is freshly crawled for embed meta. The enqueue is fire-and-forget and debounced by `urlId`, so it is safe to call on every upsert (including reactivation of soft-deleted relations). See [docs/overview/architecture/crawling.md](crawling.md#triggered-crawls).

## Adding a New Relation

1. Update `entityRelationPredicates` in `config.mts` if the predicate is new
2. Add the relation entry to `entityRelations` in `config.mts` under `[subjectType][objectType][predicate]`
3. Tables and indexes are created automatically on next migration run

## Related Services

- [Backend rules](../../../backend/CLAUDE.md) — service and data conventions
- [Web rules](../../../web/CLAUDE.md) — UI and routing conventions

- [backend/services/entity-relations/README.md](../../../backend/services/entity-relations/README.md) -- config, upsert, delete, query logic
- [backend/services/bookmarks/README.md](../../../backend/services/bookmarks/README.md) -- bookmark operations built on entity relations
- [backend/services/feeds/README.md](../../../backend/services/feeds/README.md) -- feed filtering using follow/mute/block relations
- [backend/api/v1/entity-relations/README.md](../../../backend/api/v1/entity-relations/README.md) -- API endpoints
