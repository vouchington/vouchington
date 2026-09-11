# RSS Feeds

RSS feeds are source entities owned by `topic_type='rss_feed'` topics. API behavior is documented in [../../api/v1/rss-feeds/README.md](../../api/v1/rss-feeds/README.md), and fetch work is owned by [../../queues/rss-feeds/README.md](../../queues/rss-feeds/README.md).

Creation paths:

- `createSourceFromUrl()` creates the source topic and `rss_feeds` row in one transaction, writes initial enablement and discoverability change rows, upvotes the source topic, optionally follows the feed, and enqueues an immediate crawl.
- `createRssFeed()` is the low-level primitive for trusted internal callers and test helpers. It also seeds initial enablement and discoverability rows, then enqueues crawl and discoverability evaluation after commit.

## State

Enablement and public discoverability are append-only state logs:

- `rss_feed_enablement_changes`
- `rss_feed_discoverability_changes`

`view_rss_feeds` exposes the latest state as `is_enabled` and `is_discoverable`. New feeds start enabled and discoverable, then the discoverability worker can hide them when score, follower, or publisher-type policy requires it. Admins can change either state through `PATCH /api/v1/rss-feeds/:id`; the optional `reason` field is stored on the change row.

`rss_feeds.is_enabled` and `rss_feeds.is_discoverable` are trigger-maintained projections of the latest append-only change rows. Each trigger locks the feed row before re-reading the latest UUIDv7 change, so concurrent state changes serialize correctly. `view_rss_feed_current_states` projects those base columns without lateral history scans and remains the canonical join surface for search, recommendation, feed, metric, and fetch queries.

The [../../queues/rss-feed-discoverability/README.md](../../queues/rss-feed-discoverability/README.md) worker evaluates discoverability from topic score, RSS feed follow count, and publisher type. The tunable fields live in `rss-feed-discoverability-config`. Publisher types `aggregator` and `forum` always evaluate to undiscoverable. System updates preserve human intent: if the latest discoverability row was written by a non-system user, the worker returns `skipped:human-locked`. Every committed enablement or discoverability change enqueues the debounced top-hashtag materialized-view refresh so recommendation eligibility follows automatic and user-driven state changes promptly; the hourly refresh remains the recovery path.

## Search

`searchRssFeeds()` supports:

- `topic_id` / `topic_ids`
- `topic_match='any' | 'all'`
- `include_descendants=true`
- `publisher_type_id` / `publisher_type_ids`
- `publisher_type_match='any' | 'all'`
- `text_search_query`
- `enabled=true | false | null`
- `discoverable=true | false | null`

Each row includes `topic_election` and the dominant positive-vote `publisher_type` relation when present.

## Fetching

Only enabled feeds are eligible for fetching. Fetching is owned by [../../queues/rss-feeds/README.md](../../queues/rss-feeds/README.md). `last_modified_at`, `etag`, and `last_fetched_at` remain on `rss_feeds` as crawl metadata. Raw feed bodies in `rss_feed_crawls` are 30-day monthly-drop history owned by `cleanupPartitions`; 304 replay of `feed_data` requires a crawl still inside that window. Fetch withholds conditional GET validators when no replayable crawl body remains, matching HTML snapshot expiry.

Feed response bodies remain capped by `@services/crawler-rss` at 10MB. After parsing, fetch processing is also bounded to 500 valid items per fetch and 20 normalized unique categories per item; truncation is recorded in backend analytics. Category truncation counts cover retained items only, while dropped valid items are counted separately by the item cap metric.

Permanent RSS fetch failures soft-delete the feed by default. `unreliable_status_codes` lets admins mark specific HTTP 4xx statuses as retryable at the feed or hostname level. Feed values override hostname values; `NULL` inherits and `[]` explicitly disables hostname retry exceptions. YouTube hostnames are seeded with `[404]` because channel feeds can intermittently return 404 for still-valid feeds.

## Crawl Prioritization

Feeds are scored and tiered nightly to ensure high-value feeds are fetched more frequently.

### Materialized View

`mv_rss_feed_crawl_tiers` (defined in `backend/data-stores/psql/views/2026-05-07-rss-feed-crawl-inputs.sql`) precomputes `crawl_score` and `crawl_tier` per enabled feed. The scoring formula and tier percentile thresholds are baked into the view SQL:

- Score: `log1p(weighted_follower_count) + votes_score_net`
- Tier boundaries: top 0.1% → tier 1, top 1% → tier 2, top 5% → tier 3, top 20% → tier 4, remainder → tier 5
- `CUME_DIST()` runs at MV refresh time, not at dispatch time

The private per-user follower weights are Free = 1, Plus = 2, and Pro = 3. Redirect aliases are
canonicalized before counting, so each user contributes once to a canonical feed. A Plus/Pro weight
requires a current membership (`active` or `past_due`; not deleted, cancelled, expired, or paused;
and `expires_at` null or future). Membership changes are visible to crawl scheduling after the next
nightly refresh. This is relative prioritization only, never a public guaranteed fetch SLA.

A unique index on `rss_feed_id` enables `REFRESH MATERIALIZED VIEW CONCURRENTLY` so reads are not blocked during refresh.

### Nightly refresh

`mv_rss_feed_crawl_tiers` is refreshed nightly by the psql queue's generic `refreshMaterializedView` job (scheduler `refresh-rss-feed-crawl-tiers`). The refresh runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` against the allow-listed view; no bespoke retier job exists.

### Dispatcher

`getRssFeedsToFetch()` (tiered mode when enabled) LEFT JOINs against `mv_rss_feed_crawl_tiers` — no per-dispatch percentile ranking. Feeds not yet present in the MV (newly created, not yet refreshed) default to tier 5 via `COALESCE(crawl_tier, 5)` and are still dispatched, so a freshly created feed is never missed before the next nightly refresh:

- **Due bucket**: feeds whose `last_fetched_at` is older than their tier SLA, ordered by `crawl_score DESC`.
- **Backfill bucket**: feeds not yet due but last fetched at least the tier-1 SLA ago, ordered by time-until-deadline ASC then `crawl_score DESC`.
- Total capped at `capacity_budget` (default 100) when no explicit limit is passed; an explicit `limit` caps to `min(limit, capacity_budget)`.

### Configuration

SLAs and `capacity_budget` live in the `rss-feed-crawl-config` DynamicConfig key and are editable
through `/admin/dynamic-config` (see `crawl-config.mts`). SLA fields are capped at 7 days and
`capacity_budget` is capped at 10,000 feeds per dispatcher run. Crawl prioritization can be
disabled entirely via `enabled: false`, which reverts `getRssFeedsToFetch` to the flat TTL query.
Tier percentile thresholds and the score formula are baked into the MV SQL and are not
runtime-tunable.

## Deletion

- `softDeleteRssFeedById(id)` sets `deleted_at`; internal use only.
- `hardDeleteRssFeedById(id)` removes the row and cascades dependent RSS feed rows.
- `hardDeleteRssFeedByIdAsCurrentUser(currentUser, id)` is the admin-only wrapper.
