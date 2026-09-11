# RSS Feed Items API

Search and browse RSS feed items.

## Endpoints

| Method | Route                                          | Authentication | HTTP Caching | Description                                                |
| ------ | ---------------------------------------------- | -------------- | ------------ | ---------------------------------------------------------- |
| GET    | `/api/v1/rss-feed-items`                       | Optional       | Yes (anon)   | Search RSS feed items                                      |
| GET    | `/api/v1/rss-feed-items/:id`                   | Optional       | Yes (anon)   | Get one RSS feed item detail payload                       |
| GET    | `/api/v1/rss-feed-items/:id/follow-context`    | Required       | No           | Get followed-user likes/dislikes for an item               |
| POST   | `/api/v1/rss-feed-items/:rssFeedItemId/shares` | Required       | No           | Queue a feed share event to current followers              |
| POST   | `/api/v1/rss-feed-items/:rssFeedItemId/sends`  | Required       | No           | Queue manual notification events to followers              |
| POST   | `/api/v1/rss-feed-items/:id/views`             | None           | No           | Record a recently-viewed event for the item                |
| GET    | `/api/v1/rss-feed-items/:id/votes`             | Required       | No           | List votes for an item (admins list all voters, paginated) |

## GET /api/v1/rss-feed-items

Returns a paginated list of RSS feed items with streaming response.

Query parameters:

- `after` — opaque timestamp cursor from `page_info.end_cursor`
- `limit` — 1–100, default 10
- `q` / `text_search_query` — full-text search query using `websearch_to_tsquery` against item titles and content. `#topic-slug` tokens inside `q` are parsed as topic filters and removed from the text query; unresolved hashtag topics return `400 { "error": "Topic not found: #topic-slug" }`. Ignored when `semantic_search_query` is present.
- `semantic_search_query` — embedding-based similarity search using Bedrock Nova Multimodal embeddings (1024-dim HNSW cosine). When set, results are ordered by cosine similarity instead of recency and use an opaque scoped relevance cursor through `after`; cursors are valid only for the same normalized query and effective filters. Wins over `q`-derived `text_search_query` when both are supplied.
- `rss_feed` / `rss_feeds` — RSS feed UUID(s). Non-UUID values return 422 (RSS feeds have no slug support).
- `topic` / `topics` — topic UUID(s), slug(s), or alias(es). Unresolved identifiers return an empty result (not 422). Malformed identifiers (not UUID/slug format) return 422.
- `category_topic` / `category_topics` — category topic UUID(s), slug(s), or alias(es)
- `media_type` / `media_types` — `article`, `audio`, or `video`
- `similar_window_days` — integer from 0 through 365; values outside this range are ignored
- `has_related_posts` — boolean; filters items with or without linked discussion posts
- `story_id` — story UUID
- `read` — boolean; filters the authenticated viewer's read state. The filter is ignored without an authenticated viewer.

Plural parameters use comma-separated values in the published API contract; the runtime parser
also accepts repeated keys for compatibility. At most 10 identifiers are resolved per feed, topic,
or category filter.

Response is streamed and includes: `results`, `page_info`, `rss_feed_items`, `rss_feed_item_elections`, `rss_feed_item_embeds`, and `rss_feed_item_content_html` (map of item ID → sanitized HTML for the best content field; items with no content are omitted). `rss_feed_item_embeds` is keyed by item ID and carries backend-selected display text plus authorized image/player projections; complete raw crawl metadata and oEmbed provenance are administrator-only. For authenticated users also: `bookmarks`, `rss_feed_bookmarks`, `election_votes`, `related_posts_by_url_id`, `posts`, `posts_metrics`. YouTube Atom metadata, when present, is included inside each `rss_feed_items[id].data` payload.

Cached (short TTL) for unauthenticated users.

`rss_feed_items` entries never include nested `election` objects. Use the
`rss_feed_item_elections` sidecar map from the same response for vote counts.

## GET /api/v1/rss-feed-items/:id

Returns a single RSS feed item detail payload by UUIDv7 `id`. Response includes:

- `rss_feed_item`
- `rss_feed_item_election`
- `rss_feed_item_embeds` — item-keyed embed sidecar using the same contract as the list response
- `content_html` — sanitized HTML from the best content field (`content:encoded` → `content` → `description` → `summary`); `null` when no content fields exist. Plain-text YouTube `media:description` is rendered separately by the modal text fallback.
- `bookmarks` for authenticated users when present
- `election_vote` for authenticated users when present

YouTube Atom metadata is returned inside `rss_feed_item.data` when present:
`media:description`, `media:starRating`, and `media:statistics`.

The detail election is a singular sidecar fetched through the cached batch election helper; the
`rss_feed_item` entity itself does not include election fields.

## GET /api/v1/rss-feed-items/:id/follow-context

Authenticated-only personalization payload for RSS item detail surfaces. Returns:

- `positive_by_following`
- `negative_by_following`

Each field is shaped as `{ total, users }`, where `users` is a capped list of hydrated public users.

## POST /api/v1/rss-feed-items/:rssFeedItemId/shares

Queues feed-share rows for the caller's current followers only. Later followers do not receive the
event. Distribution runs in bounded follower chunks. The request has no body and does not require
a JSON `Content-Type` header.

Response:

```json
{ "status": "accepted", "distribution_id": "<uuid>" }
```

## POST /api/v1/rss-feed-items/:rssFeedItemId/sends

Queues manual-send notification rows for the caller's current followers only. Distribution runs in
bounded follower chunks, and each notification chunk enqueues normal push delivery.

Request:

```json
{ "audience": "all_followers" }
```

or

```json
{
  "audience": "selected_followers",
  "recipient_user_ids": ["<uuid>"]
}
```

Selected recipients must contain 1–100 distinct valid UUIDs, must all currently follow the sender,
and cannot be combined with unknown request fields. `all_followers` requests contain only
`audience`.

## GET /api/v1/rss-feed-items/:id/votes

Admins list all voters; other authenticated users see only their own vote.

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`; advances to the next page. Returns 400 for an invalid or cross-resource/cross-branch cursor.
- `limit` — results per page (1–100, default 100)

Response includes `results` and `page_info`.

## Performance

| Endpoint                                          | Round Trips | Caching                                                       | Notes                                                                                                                                                                                                                             |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/v1/rss-feed-items                        | 2–3         | Search: anon Valkey; Entities: Valkey batch; HTTP: short anon | Search → story member IDs + post\_\_stories lookup (parallel, if stories) → parallel streaming (items, item-keyed embeds, elections, content_html batch via in-process Rust, bookmarks, rss_feed_bookmarks, votes, related posts) |
| GET /api/v1/rss-feed-items/:id                    | 2           | Entities: Valkey batch; HTTP: long anon                       | Fetch item → parallel streaming (item-keyed embed, election, bookmarks, vote, content_html via in-process Rust)                                                                                                                   |
| GET /api/v1/rss-feed-items/:id/follow-context     | 2           | None                                                          | Fetch item → `Promise.all` liked/disliked                                                                                                                                                                                         |
| PUT /api/v1/rss-feed-items/:id/vote               | 2           | None                                                          | Fetch item + upsert vote                                                                                                                                                                                                          |
| GET /api/v1/rss-feed-items/:id/votes              | 2           | None                                                          | Fetch item + votes query                                                                                                                                                                                                          |
| POST /api/v1/rss-feed-items/:id/discussions       | 2           | None                                                          | Fetch item + create link post from stored URL                                                                                                                                                                                     |
| POST /api/v1/rss-feed-items/:rssFeedItemId/shares | 1           | None                                                          | Queue follower distribution                                                                                                                                                                                                       |
| POST /api/v1/rss-feed-items/:rssFeedItemId/sends  | 1           | None                                                          | Queue follower distribution + chunked push delivery                                                                                                                                                                               |
| POST /api/v1/rss-feed-items/:id/views             | 1           | None                                                          | Rate-limited; writes session+user recently-viewed Valkey ZSETs                                                                                                                                                                    |

## Related

- Service: [../../services/rss-feed-items/](../../../services/rss-feed-items/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
