# Feed Query Builders

Shared SQL fragment builders for constructing feed queries against `posts` and `rss_feed_item_sources` — privacy/visibility filters, hot-score ranking, exclusion CTEs, and time-range filters. Each builder returns a `SQLStatement` (from `sql-template-strings`) meant to be composed into a larger query with `.append()`.

## Discoverability

```typescript
import {
  feedIsEnabledAndDiscoverableSql,
  itemHasDiscoverableSourceSql,
} from '@modules/feed-query-builders'

const query = sql`SELECT * FROM view_rss_feeds feeds WHERE `.append(
  feedIsEnabledAndDiscoverableSql('feeds'),
)
```

- `feedIsEnabledAndDiscoverableSql(feedAlias)` — EXISTS clause checking `view_rss_feed_current_states` for an enabled, discoverable feed. Throws if `feedAlias` isn't a safe SQL identifier.
- `itemHasDiscoverableSourceSql(itemColumnSql)` — EXISTS clause joining `rss_feed_item_sources`, `rss_feeds`, and `view_rss_feed_current_states` to confirm an item has at least one discoverable source.

## Privacy and visibility

```typescript
import { buildPrivacyFilter } from '@modules/feed-query-builders'

const filter = buildPrivacyFilter('posts', currentUser)
if (filter) query.append(sql` AND `).append(filter)
```

- `buildPrivacyFilter(postsAlias, currentUser?)` — full privacy filter (broadcast checks, suspended-author exclusion, approval state, comment audience inherited from the root post). Returns `null` for admins, since no filtering applies.
- `buildPublicPostEligibilityFilter(candidateAlias, rootAlias)` — canonical anonymous publication eligibility for a candidate and its resolved root.
- `buildViewerPostDiscoveryEligibilityFilter(candidateAlias, rootAlias, options)` — authenticated discovery eligibility, including viewer-aware access plus archived-content and suspended-author exclusions.
- `buildDirectPostEligibilityFilter(candidateAlias, rootAlias, options)` — direct-reader predicate for a candidate and its resolved root. It independently checks both clearance states, root audience and community publication, deleted state, and story-source eligibility. Direct access deliberately permits archived content and suspended authors; discovery callers add those stricter exclusions separately.

## Hot score

```typescript
import { buildHotScoreExpression, HOT_SORT_HALF_LIFE_SECONDS } from '@modules/feed-query-builders'

const query = sql`SELECT *, `
  .append(buildHotScoreExpression())
  .append(sql` AS hot_score FROM posts`)

const aliasedQuery = sql`SELECT p.id, `
  .append(buildHotScoreExpression('p'))
  .append(sql` AS hot_score FROM posts p`)
```

- `HOT_SORT_HALF_LIFE_SECONDS` — half-life used by the hot-score decay, `3.0 * 86400.0` (3 days).
- `buildHotScoreExpression(postsAlias = 'posts')` — decays the aliased post's `votes_score_net` by age derived from its UUIDv7 ID. The alias must be a safe SQL identifier.
- Future UUIDv7 timestamps are treated as age zero, so clock skew or malformed future IDs cannot amplify the vote score or overflow PostgreSQL numeric arithmetic. IDs without an extractable UUIDv7 timestamp retain a `NULL` score.

## Exclusion CTEs

```typescript
import {
  buildExcludedCTE,
  buildExcludedHostnameIdsCTE,
  buildCommunityExcludedHostnameIdsCTE,
} from '@modules/feed-query-builders'

const excludedTopics = buildExcludedCTE(userId, {
  relationTable: 'relation__user__block__topic',
  idColumn: 'topic_id',
  cteAlias: 'excluded_topics',
})
```

- `buildExcludedCTE(userId, config, additionalTables?)` — builds a `WITH ${config.cteAlias} AS (...)` CTE of object IDs a user has blocked/muted, reading `config.relationTable` (filtered to `subject_id = userId AND deleted_at IS NULL`) and UNIONing in any `additionalTables`.
- `buildExcludedHostnameIdsCTE(userId)` — builds `excluded_hostnames` and `excluded_hostname_ids` CTEs from a user's blocked/muted URL hostnames, matching subdomains via reversed-hostname prefix and including site-wide blocked hostnames.
- `buildCommunityExcludedHostnameIdsCTE(communityId)` — the same pattern scoped to a community's muted hostnames.

## Time range

```typescript
import { buildTimeRangeFilter, getTimeRangeLowerBoundDate } from '@modules/feed-query-builders'

const filter = buildTimeRangeFilter('1w', 'posts.id')
if (filter) query.append(sql` AND `).append(filter)
```

- `buildTimeRangeFilter(timeRange, idColumn)` — returns `${idColumn} >= <uuidv7 lower bound>` for `'1d' | '1w' | '1m' | '1y'`, or `null` for `'all'`. Throws if `idColumn` isn't a safe identifier.
- `getTimeRangeLowerBoundDate(timeRange)` — the same lower bound as a `Date`, or `null` for `'all'`.

## Topic post candidates

```typescript
import {
  buildTopicPostCandidateSelect,
  buildUniversalTopicPostCandidatePairsSelect,
  buildTopicMembershipExists,
  buildTopicAliasMembershipExists,
} from '@modules/feed-query-builders'

const candidates = sql`FROM (`.append(buildTopicPostCandidateSelect(topicId)).append(sql`) candidate
  JOIN posts candidate_post ON candidate_post.id = candidate.post_id`)

filters.push(buildTopicMembershipExists('posts.id', topicId))
filters.push(buildTopicAliasMembershipExists('posts.id', aliasId))
```

- `buildTopicPostCandidateSelect(topicId)` — single-topic candidate `post_id` derivation (direct
  category relation `UNION ALL` hashtag-alias relation), meant for a `FROM (…) candidate` subselect
  so the planner drives the query from the topic's indexed relation rows instead of re-testing every
  post. Kept textually identical to the `count__discussions` candidate body in
  `backend/data-stores/psql/views/2025-01-19-topic-metrics.sql` — see that file's comment for why
  this must stay `UNION ALL` with no CTE.
- `buildUniversalTopicPostCandidatePairsSelect(topicIds)` — many-topic `(post_id, topic_id)` pairs
  across all four topic-attachment shapes (direct category relation, hashtag alias relation, review
  topic ratings, data-point topics), meant for a `FROM (…) universal_topic_candidates` subselect.
- `buildTopicMembershipExists(postIdColumn, topicId)` — single-topic membership test built as
  `postIdColumn IN (SELECT candidate.post_id FROM (…) candidate)` over
  `buildTopicPostCandidateSelect`, rather than a correlated `EXISTS (… UNION ALL …)` (Postgres cannot
  pull a `UNION ALL` body into a semijoin, so that shape materialized the full candidate set once per
  outer row instead of once per query — see #11082). Tests whether the post at `postIdColumn` is
  positively attached to `topicId`, directly or through one of its hashtag aliases. Throws if
  `postIdColumn` isn't a safe SQL identifier (e.g. `posts.id`).
- `buildTopicAliasMembershipExists(postIdColumn, aliasId)` — correlated `EXISTS` testing whether the
  post at `postIdColumn` is positively attached to the hashtag alias `aliasId`.

## RSS feed item topic candidates

```typescript
import { buildRssFeedItemTopicMembershipExists } from '@modules/feed-query-builders'

query.append(sql` AND `).append(buildRssFeedItemTopicMembershipExists('rss_feed_items.id', topicId))
```

- `buildRssFeedItemTopicMembershipExists(rssFeedItemIdColumn, topicId)` — single-topic membership
  test built as `rssFeedItemIdColumn IN (SELECT candidate.rss_feed_item_id FROM (…) candidate)` over
  `buildRssFeedItemTopicCandidateSelect`, rather than a correlated `EXISTS (… UNION ALL …)`: Postgres
  cannot pull a `UNION ALL` body into a semijoin, so the old shape materialized the full candidate
  set once per outer row instead of once per query. Same anti-pattern as `buildTopicMembershipExists`
  above — see #11082.
- `buildRssFeedItemTopicCandidateSelect(topicId)` (`rss-feed-item-topic-candidates.mts`, module-
  internal — not re-exported from this barrel) — single-topic candidate `rss_feed_item_id`
  derivation (direct category relation `UNION ALL` hashtag-alias relation) that
  `buildRssFeedItemTopicMembershipExists` wraps in a `FROM (…) candidate` subselect so the planner
  drives the query from the topic's indexed relation rows instead of re-testing every RSS feed item.
  Mirrors `buildTopicPostCandidateSelect`'s candidate-bind pattern from `topic-post-candidates.mts`,
  adapted to RSS feed items' 2 relation legs (no shared table-name constants module, no 4-way
  "universal topic" union). Unlike `buildTopicPostCandidateSelect`, it has no external consumer of
  its own today — nothing needs the raw candidate rows outside `buildRssFeedItemTopicMembershipExists`
  — so it stays file-private to `@modules/feed-query-builders` and is exported only for its own unit
  test to import directly from the source file.

## Related

- [Feed architecture](../../../docs/overview/architecture/feeds.md)
- [Search architecture](../../../docs/overview/architecture/search.md)
- [Trending posts](../../services/trending-posts/README.md)
