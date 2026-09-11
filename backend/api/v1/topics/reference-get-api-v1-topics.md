# GET /api/v1/topics

[Back to Topics API](README.md#get-apiv1topics)

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`
- `limit` — 1–100, default 25; anonymous requests are capped at 25
- `sort` — `new`, `best`, or `relevance`
- `q` / `text_search_query` — text search. `#topic-slug` tokens inside `q` are resolved as topic filters; unresolved hashtags return 400.
- `semantic_search_query` — embedding-based similarity search
- `topic_types` — comma-separated topic types: `topic`, `rewards_program`, `rewards_program_status`, `referral_program`, or `card`
- `similar_post` — source post UUID or slug
- `similar_topic` — source topic UUID, slug, or alias
- `similar_rss_feed_item` — source RSS feed item UUID
- `slugs` — up to 100 exact topic slugs, comma-separated
- `spending_category` — boolean; filters by spending-category membership
- `rss_feed` — boolean; filters by RSS-feed association

Comma-separated arrays are the canonical published form. The runtime parser also accepts repeated
keys for compatibility.

Response streamed: `results`, `page_info`, `topics`, `topics_metrics`, `markdown_to_html`. For authenticated users also: `bookmarks` and `election_votes`.
The response also includes `topic_elections`, keyed by topic ID, so topic cards can render
vote counts without extra fetches. `election_votes`, keyed by topic ID, carries the authenticated viewer's
prior vote score on each topic — omitted when the viewer has no votes on the page.

Each `topics_metrics` entry includes `count` with public totals for `discussions`, `reviews`,
`data-points`, `news`, and `latest` feed items.
