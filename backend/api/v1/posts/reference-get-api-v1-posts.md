# GET /api/v1/posts

[Back to Posts API](README.md#get-apiv1posts)

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`
- `limit` — 1–100, default 25; anonymous requests are capped at 25
- `sort` — `hot`, `new`, `best`, `relevance`, or `following_new`
- `q` / `text_search_query` — full-text search query. `#topic-slug` tokens inside `q` are parsed as universal topic filters and removed from the text query; unresolved hashtag topics return `400 { "error": "Topic not found: #topic-slug" }`.
- `semantic_search_query` — adds an embedding-based similarity signal to search ranking
- `post_types` — comma-separated post types: `discussion`, `review`, `data_point`, `comment`, `link`, `article`, `blog_post`, or `story`
- `time_range` — `1d`, `1w`, `1m`, `1y`, or `all`
- `url` — URL UUID or HTTP(S) URI. HTTP URLs are normalized to HTTPS before lookup; URL fragments are removed.
- `creator` — creator UUID or username
- `similar_post` — post UUID or slug
- `similar_topic` — topic UUID, slug, or alias
- `similar_rss_feed_item` — RSS feed item UUID
- `review_topic` — review topic UUID, slug, or alias (reviews with ratings for this topic)
- `data_point_topic` — data point topic UUID, slug, or alias (data points for this topic)
- `topic` / `topics` — singular topic identifier or comma-separated topic identifiers. This universal filter matches posts tagged with, reviewing, or about any listed topic.
- `category` / `categories` — singular topic identifier or comma-separated topic identifiers for tag-based relations only (`relation__post__category__topic`)
- `story_id` — story UUID; filters posts linked through `post__stories`
- `drafts` — boolean; includes the authenticated creator's drafts. It cannot expose another user's or anonymous drafts.
- `data_point_vertical` — exact data-point vertical string

Plural parameters use one comma-separated value in the published API contract (for example,
`topics=banking,cards`). The runtime parser also accepts repeated keys for compatibility. At most
10 topic or category identifiers are resolved per filter.

Response is streamed via `streamJsonObject()` and includes: `results`, `page_info`, `posts`, `posts_metrics`, `post_elections`, `markdown_to_html`, and `communities` for posts that belong to a community. For authenticated users also: `bookmarks`, `election_votes`. For admins also: `post_moderations`.

`sort=following_new` is authenticated personalization for review/topic/post surfaces that need followed creators first. It sorts posts into two buckets:

- creators followed by the current user
- everyone else

Within each bucket, posts remain newest-first. Unauthenticated requests fall back to `sort=new`.
Pagination for `sort=following_new` uses a composite cursor and requires both rank and post ID components; partial cursors are treated as invalid rather than silently falling back to the first page.

Cached (short TTL) for unauthenticated users.

`posts_metrics` is hydrated in one requested-ID-constrained batch. Counts preserve public-post
eligibility, recursive ancestor semantics, and input ordering for duplicate IDs and slugs.

`topic_recommendation` posts are intentionally excluded from `/api/v1/posts`; use `/api/v1/topic-recommendations` for that workflow queue.
