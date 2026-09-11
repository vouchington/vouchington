# Podcasts reference

[Back to Podcasts](PODCASTS.md)

## Parsing

Extractors live in `backend/services/rss-feeds/validate.mts` next to existing feed
extractors:

- `extractPodcastShowMetadata(parsedFeed)` — drills `parsedFeed.itunes` (author, owner,
  image `{href}` or bare string, explicit, type). Returns `null` when no itunes data.
- `extractFeedCategories(parsedFeed)` — flattens `parsedFeed.itunes.categories`
  (`Array<{text, categories?}>`) recursively into a normalized (trim+lowercase)
  deduplicated string array.

These are called from `persistFeedMetadataAndReconcileLanguage`
(`backend/services/rss-feeds/reconcile-item-language.mts`) — the seam called by
`fetch.mts` after each successful crawl. Upserts run when `parsedFeed.itunes` is
present, before `feed_type` is finalized, so early crawls still populate the extension
tables.

Persist services:

- `backend/services/rss-feeds/podcast-show.mts` — `upsertPodcastShow`, `getPodcastShow`
- `backend/services/rss-feeds/categories.mts` — `upsertRssFeedCategories`, `getRssFeedCategories`

## Read Model

`backend/data-stores/psql/views/2025-03-01-rss-feeds.sql` LEFT JOINs `podcast_shows`
and aggregates `rss_feed_categories` into the `view_rss_feeds` view. The view fields:

- `podcast_show` — JSON object with `{itunes_author, itunes_owner_name, cover_art_url, is_explicit, itunes_type}` or `null`
- `categories` — JSON array of `{category_text, topic_id}` objects, alphabetically ordered

The API endpoint (`backend/api/v1/rss-feeds/`) proxies `podcast_show.cover_art_url` to
`/sideload/` using `buildSideloadImageUrl` before returning the response.

## Hub Routes

Two new routes under `web/app/(podcasts)/`:

| Route                  | File                                              | Description                            |
| ---------------------- | ------------------------------------------------- | -------------------------------------- |
| `/podcasts`            | `web/app/(podcasts)/podcasts/page.tsx`            | Grid of all discoverable podcast shows |
| `/podcasts/[category]` | `web/app/(podcasts)/podcasts/[category]/page.tsx` | Filtered grid by Apple iTunes category |

Both routes query `GET /api/v1/rss-feeds?feed_type=podcast[&category=<slug>]`. The
existing partial index `idx_rss_feeds__feed_type` handles the `feed_type` filter.

The **show page** remains `/source/[id]` (no duplicate canonical URL). When
`feed_type==='podcast'`, the show page should branch to show cover art, author, and
explicit badge, and default to the `news` subpage (episode list).

### URL Helpers

```ts
podcastsHref() // → '/podcasts'
podcastCategoryHref(category) // → '/podcasts/<slug>'
```

Both are exported from `web/lib/links/entity-href.ts`.
