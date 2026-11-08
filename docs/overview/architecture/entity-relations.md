# Entity Relations

See also: Entity × Action Matrix — how predicates map to UI actions on every surface. Entity × Lifecycle Flow Matrix — lifecycle flows per entity with authorization tiers. User Relation Matrix — user profile management surfaces for bookmark relations.

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

## Story source replacement

Story projection admits one prefix of the story's active RSS items, ordered by item id up to the
post related-URL cap and the generation's high-water mark, then soft-deletes projected rows whose
URL is outside that eligible prefix. The row stays because votes and history reference it. The
provider screen finishes before the admission transaction opens. Admission and the prune then run in the
same transaction as the prefix hostname locks. Those locks are a fixed stripe set shared with
hostname blocking, so a full prefix cannot exhaust the lock table.
Rows inside the prefix that are blocked or are referral links are not admitted, and projected
copies of those URLs come off. Eligible items past the prefix stay off the post until a later
generation; the statement does not walk further to refill the cap. A lowered cap takes effect on
the next refresh: projected URLs outside the new prefix come off. Changing the cap does not by
itself start a generation.

Relations a person added by hand are left in place. A projected row that a person later touches is
kept by the generation's mutation fence. Refresh copies that fence onto the new generation, and
cleanup removes only older generations, so the edit stays protected. A block that lands on an
already-written URL after this statement commits is handled by the next generation, which prunes
projected URLs missing from the new eligible prefix.

Post-related URL writes recheck the relation cap under the post scope lock, so they cannot exceed
it. Other relation types keep check-before-write behavior and may overshoot during concurrent
admission.

## Table Structure

- Table naming: `relation__<subject>__<predicate>__<object>` (e.g. `relation__user__follow__user`)
- User-subject relation tables (`relation__user__*`) are **not partitioned** and use plain B-tree indexes, because HASH partitioning caused reverse-lookup fan-out and is forbidden repo-wide — see [partitioning-strategy.md](partitioning-strategy.md)
- Tables are created automatically from the config via idempotent migrations
- No destructive actions on config removal -- unused tables persist but are no longer referenced

## Privacy Filter Integration

`buildPrivacyFilter()` in `backend/modules/feed-query-builders/privacy-filter.mts` uses entity relation tables to enforce post visibility in feeds and search. It checks follow relationships via `relation__user__follow__user` to determine broadcast audience access. Since these tables use plain B-tree indexes, the reverse lookup hits a single index scan — previously, when this table was hash-partitioned by `subject_id`, this same `object_id` lookup scanned all 8 partitions 5+ times per feed query. See docs/overview/architecture/services/README.md.

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

- [Backend rules](../../../backend/AGENTS.md) — service and data conventions
- [Web rules](../../../web/AGENTS.md) — UI and routing conventions

- docs/overview/architecture/services/README.md -- config, upsert, delete, query logic
- docs/overview/architecture/services/README.md -- bookmark operations built on entity relations
- docs/overview/architecture/services/README.md -- feed filtering using follow/mute/block relations
- docs/requirements/api/v1/entity-relations/README.md -- API endpoints
