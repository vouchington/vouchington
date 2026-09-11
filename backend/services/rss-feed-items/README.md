# RSS Feed Items

## Acceptance Criteria

### Creation / Upsert

RSS Feed Items are only ever upserted. Item `link` values with `http:` scheme are automatically upgraded to `https:` before URL-table storage (via `normalizeUrlForUrlTable`). URL fragments are stripped from the stored `url`, while the raw publisher link remains in `data.link`.
Before upserting, check if the item already exists by hashing the contents of the payload, e.g. `rss_feed_item.content_sha256 = hash256(JSON.stringify(data))` where the `data` is the source data.
If the item does not exist, upsert (meaning use `ON CONFLICT` in case there are read-replica delays).

Ingestion is bounded before database writes. Each RSS fetch processes at most 500 valid items in
the parsed feed order, and each item stores at most 20 normalized unique categories. Categories are
trimmed and deduped case-insensitively before the cap is applied.
Category reads and writes use 1,000-pair SQL batches. Cache invalidation uses awaited 100-item
batches so a full 500-item import cannot saturate the Valkey client's in-flight request limit.

`rss_feed_item_ids` owns the permanent identity mapping
`(url_hostname_id, guid) → id`, where `url_hostname_id` is the RSS feed URL's hostname because GUIDs
are unique per feed domain rather than per feed. Ingest first upserts this skinny, unpartitioned
lookup, then upserts the fat content row into the UUIDv7 `id`-partitioned `rss_feed_items` table in
the same transaction. Soft deletion removes neither the identity nor its UUID, so re-ingest
resurrects the same row. Writer transactions lock existing identities without updating them and
insert only missing GUIDs, avoiding a new tuple version and WAL churn for every unchanged feed
poll while preserving the global GUID lock order.

The shared UUIDv7 `id` is the `rss_feed_items` primary key used by API routes (for example,
`GET /api/v1/rss-feed-items/:id`), frontend references, and all entity-relation FKs. Multiple RSS
feeds can contain the same hostname-grain item; the N:M `rss_feed_item_sources` join table tracks
that provenance independently of identity.
See [Source Item Anatomy](../../../docs/requirements/anatomy/source-item.md#data-model) for the
cross-surface entity contract.

### Concurrent ingestion ordering

Every multi-row conflict write is globally deduplicated and ordered by its live unique-index key
before it is chunked: identities by `(url_hostname_id, guid)`, item content by `id`, sources by
`(rss_feed_id, rss_feed_item_id)`, snapshots by their item keys, and categories by
`(rss_feed_item_id, lower(category_text))`. This lets concurrent feeds submit the same items in
opposite parsed-feed order without taking incompatible PostgreSQL row locks. Ordering is an
internal persistence invariant: RSS result and duplicate-resolution semantics remain unchanged.
The real-PostgreSQL regression races those production writers through separate clients; the
schema-aware static SQL guard owns verification that each multi-row statement retains its required
`ORDER BY` prefix, without test-only database triggers.

When upserting, update the following:

- `url_id` - in case the URL of the item changed
- `data` - JSONB payload
- `published_at` - when the publisher says this item was published (generated column: earliest of `isoDate`, `pubDate`, or fetch time; `isoDate` is normalized from `dc:date`, Atom `published`, JSON Feed `date_published`, or Atom `updated`). Invalid, non-finite, null-like, and pre-1970 publisher dates are ignored and the item falls back to fetch time.

#### Embeddings

Embeddings should be enqueued to be created every time a new RSS Feed Item is inserted.
These embeddings will be used for searching.

### Searching

Sorting will always happen by `LEAST(uuidv_extract_timestamp(id), published_at) DESC`.
We disallow publishers from continuously bumping their items, while also handling cases when we fetch the feed too late.

You can create a stored column and index for this:

```sql
ALTER TABLE rss_feed_items
ADD COLUMN sort_ts TIMESTAMPTZ
GENERATED ALWAYS AS (
  LEAST(uuidv_extract_timestamp(id),
        COALESCE(published_at, 'infinity'::timestamptz))
) STORED;

CREATE INDEX IF NOT EXISTS feed_items_sort_ts_idx
ON rss_feed_items (sort_ts);
```

Filtering:

- `rss_feed_ids` - filter by a list of RSS Feeds
- `limit`
- `published_lt` - exclusive pagination cursor on `sort_ts`
- `id_lt` - tie-breaker cursor for stable pagination when `sort_ts` ties (`(sort_ts, id) < (published_lt, id_lt)`)

### Semantic Search

When `semantic_search_query` is provided, `searchRssFeedItems` delegates to `searchRssFeedItemsBySemantic` in `search-semantic.mts`. Results are ordered by Bedrock Nova Multimodal embedding cosine similarity (HNSW, 1024-dim) instead of recency. Semantic pagination uses a scoped opaque relevance cursor containing the ranking score, microsecond-precision publication time, and item ID; it rejects cursors from a different normalized query, effective filter set, or viewer-dependent result set.

For agent-tool similarity searches (`similar_post_id`, `similar_topic_id`, `similar_rss_feed_item_id`), see `tools/search.mts` (`toolsSearchRssFeedItemIds`).

## Source Ordering

RSS feed items can be sourced by multiple feeds (tracked in `rss_feed_item_sources`). The `view_rss_feed_items` view orders sources for each item using:

1. **Enabled sources first** — feeds whose latest enablement change is enabled rank above disabled ones
2. **Discoverable sources first** — feeds whose latest discoverability change is enabled rank above hidden ones
3. **Owning topic rating** — `topics.votes_score_net DESC NULLS LAST` (higher quality feeds appear first)
4. **Discovery time** — `rss_feed_item_sources.created_at ASC` (stable tie-break)

The primary source shown in UI comes from this ordering (via `LIMIT 1` LATERAL subquery). The `rss_feed_sources` JSON array is also sorted by the same keys.

### Followed-source publication projection

`rss_feed_item_sources.published_at` records the publication time when a particular
`(rss_feed_id, rss_feed_item_id)` association is first observed. Production ingestion carries that
feed's sanitized `isoDate` and `pubDate` into PostgreSQL, which computes the generated-column
expression `LEAST(COALESCE(isoDate, infinity), COALESCE(pubDate, infinity),
uuid_extract_timestamp(item_id))` without rereading the shared item projection. `ON CONFLICT DO
NOTHING` leaves an existing association immutable when a later refresh changes the item payload.
A different feed that begins sourcing the same item later gets its own source projection.

The nullable expand migration is intentionally followed by a bounded operational backfill rather
than a table-wide transactional update. After deploying writers, operators run
`source .env && node backend/scripts/backfill-rss-feed-item-source-publications.mts --batch-size 1000 --until-complete`
until it reports completion. `--rss-feed-id <uuid>` limits a run to one feed, which lets operators
shard or retry a large rollout without scanning other feeds. Its `FOR UPDATE SKIP LOCKED` batches
make concurrent operators safe; a no-progress batch with rows remaining fails so it is retried
after contention clears. Historical rows copy the current generated item projection, while new
writes capture their immutable association value.

The online partial index on `(rss_feed_id, published_at DESC, rss_feed_item_id DESC)` is the
ordering path for followed feeds after the rollout is activated. The temporary partial index on
rows with `published_at IS NULL` is only for the backfill; the later contract migration must drop
it after a zero-null verification, add and validate the UUID-bound check constraint, and make the
column `NOT NULL`.

## Discoverability Filter

Items in the global search results (`searchRssFeedItems`) are filtered by `itemHasDiscoverableSourceSql()` from [../rss-feeds/discoverability-sql.mts](../rss-feeds/discoverability-sql.mts). This hides items whose every source feed is not discoverable.

Personal feeds (`getRssFeedItemFeedIds`) are **not** filtered by discoverability — users who follow a hidden feed still see items in their personal feed.

See [../rss-feeds/README.md](../rss-feeds/README.md) for full semantics.

## Thumbnails

`data.thumbnail_url` stores the raw external URL. It is populated during ingestion in two ways:

1. **Feed-provided**: `itunes:image` / `media:thumbnail` / `media:group.thumbnails` extracted by `extractThumbnail()` in `media-classify.mts`.
2. **First-image fallback**: when no feed thumbnail exists, `extractFirstImageSrc()` in `media-classify.mts` pulls the first external `<img src>` from `content:encoded` HTML.

The raw URL is persisted. At API-response time, `proxyThumbnailUrls()` in `sideload-thumbnails.mts` rewrites each raw URL to an absolute `IMAGE_ORIGIN/sideload/{base64url}?w=400` URL and returns the map as `rss_feed_item_thumbnail_url` in the API response. This keeps the DB value stable across signing-key rotations. See [docs/overview/architecture/content-rendering.md](../../../docs/overview/architecture/content-rendering.md) for the full image-proxying design.

## Podcast Chapters

Podcast episode chapter references are stored on the item payload as:

- `data.chapters_url` - raw chapter JSON URL from `<podcast:chapters>`
- `data.chapters_type` - declared chapter content type from `<podcast:chapters>`

The `GET /api/v1/podcast-episodes/:id/chapters` route resolves those references server-side,
rejects non-HTTPS or non-public chapter URLs, caps the fetched JSON at 200 normalized chapters,
and proxies chapter image URLs through the absolute `IMAGE_ORIGIN/sideload/` endpoint.

## YouTube Media RSS Payload

YouTube Atom feeds expose video descriptions and public metrics under `media:group`. The cleaner
stores these values in the existing RSS item `data` JSONB payload:

- `media:description` — video description fallback when standard RSS content fields are absent
- `media:starRating` — `{ average, count, min, max }` from `media:starRating`
- `media:statistics` — `{ views }` from `media:statistics`

These are payload fields only; there are no dedicated columns or sidecar API maps. New and updated
items receive them through normal RSS fetch/upsert.

Video feed items use the provider presets from `@vouchington/embeds` to normalize
`video_platform`, `video_id`, and `player_url`. YouTube and Vimeo receive an authorized player URL;
PeerTube remains external-link-only because arbitrary instance origins are not allowed by the web
iframe policy. Link-post embed responses prefer normalized metadata from the selected crawl and do
not copy metadata from another crawl. URLs without a successful crawl may still use the provider
preset fallback.

## Unmapped Category Triage

RSS feed items carry category strings (from `<category>` elements or equivalent). Each ingest carries a complete, normalized per-item snapshot: an empty array removes prior rows instead of preserving stale labels. Snapshots are stored in `rss_feed_item_categories` with a `topic_id` column that is `NULL` until an admin maps the category to a topic. Valid hashtag categories also retain their canonical `topic_alias_id`; writes synchronously refresh their category-relation vote stats before the RSS-item cache purge, then debounce the top-hashtag materialized-view refresh without changing the raw RSS label.

### `rss_feed_item_category_rejections` table

Admins can permanently hide a category from the pending triage queue by rejecting it. Rejections are stored in `rss_feed_item_category_rejections (category_text PK, created_at, created_by_id)` and can be reversed.

### Service functions

| Function                                                                   | Description                                                                                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `getUnmappedRssFeedItemCategories(opts)`                                   | List category strings with `topic_id IS NULL`; supports `status` filter (`pending`, `rejected`, `all`) and cursor pagination.                |
| `rejectRssFeedItemCategory(currentUser, categoryText)`                     | Insert into `rss_feed_item_category_rejections`; idempotent on conflict.                                                                     |
| `unrejectRssFeedItemCategory(currentUser, categoryText)`                   | Delete from `rss_feed_item_category_rejections`.                                                                                             |
| `assignRssFeedItemCategoryToTopic(currentUser, { categoryText, topicId })` | Create a `topic_aliases` row and call `backfillCategoriesForTopicAliases` to set `topic_id` on all matching `rss_feed_item_categories` rows. |

`backfillCategoriesForTopicAliases` is a shared helper that updates `rss_feed_item_categories.topic_id` for rows whose `category_text` matches any of the topic's aliases (overwriting stale assignments), or the topic's `name`/`slug` (filling nulls only).

The admin API (`GET/POST/DELETE /api/v1/rss-feed-categories`) and page (`/rss-feed-categories`) are the primary callers. See [RSS Feed Category Aliases requirements](../../../docs/requirements/content/RSS-FEED-CATEGORY-ALIASES.md) for full feature spec.

## Related

- RSS Feeds: [../rss-feeds/README.md](../rss-feeds/README.md)
- Systems:
  - [../../queues/rss-feeds/README.md](../../queues/rss-feeds/README.md) - Fetching queue
  - [../../queues/bedrock-embeddings/README.md](../../queues/bedrock-embeddings/README.md) - Embedding queue
- URLs: [../urls/README.md](../urls/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
