# GET /api/v1/rss-feeds

[Back to RSS Feeds API](README.md#get-apiv1rss-feeds)

Query parameters:

- `after` — opaque cursor returned in `page_info.end_cursor`; browse pagination is incompatible with text search and returns 400 when combined with `text_search_query` or text derived from `q`
- `limit` — 1–25, default 25
- `q` / `text_search_query` — text search. `#topic-slug` tokens in `q` become topic filters; unresolved hashtags return 400.
- `topic` — topic UUID, slug, or alias. Unresolved identifiers return an empty result (not 422). Malformed identifiers (not UUID/slug format) return 422.
- `topics` — comma-separated topic UUIDs, slugs, or aliases. Results include feeds matching any listed topic by default.
- `topic_match` — `any` (default) or `all`; two or more hashtags in `q` force `all`
- `include_descendants` — boolean; includes descendants of the selected topic roots
- `publisher_type` / `publisher_types` — publisher type topic UUID, slug, or alias.
- `publisher_type_match` — `any` or `all` when multiple publisher types are provided.
- `feed_type` — filter by feed type: `article`, `podcast`, `video`, or `mixed`
- `category` — category topic UUID, slug, or alias
- `enabled` — `true`, `false`, or the literal `null` to omit the filter
- `discoverable` — `true`, `false`, or the literal `null` to omit the filter
- `apply_mutes` — boolean; for authenticated requests, applies the current user's muted publisher types

Plural parameters use comma-separated values in the published API contract; the runtime parser
also accepts repeated keys for compatibility. Topic and publisher-type lists resolve at most 10
identifiers each.

Cached (short TTL) for unauthenticated users.

Each result row excludes election summaries. Topic and hostname vote counts are returned as
top-level sidecar maps keyed by the owning topic ID and hostname ID:
Each result row includes `is_enabled`, `is_discoverable`, and optional `publisher_type`.

```json
{
  "results": [
    {
      "id": "...",
      "topic": { "id": "...", "name": "...", "slug": "..." },
      "hostname": { "id": "...", "hostname": "example.com", "topic_id": "..." },
      "is_enabled": true,
      "is_discoverable": true,
      "publisher_type": { "id": "...", "slug": "mainstream-media", "name": "Mainstream Media" }
    }
  ],
  "topic_elections": {
    "<topic_id>": {
      "id": "...",
      "votes_score_net": 3,
      "votes_count_up": 4,
      "votes_count_down": 1
    }
  },
  "hostname_elections": {
    "<hostname_id>": {
      "id": "...",
      "votes_score_net": 2,
      "votes_count_up": 3,
      "votes_count_down": 1
    }
  },
  "page_info": { "has_next_page": false, "end_cursor": null }
}
```

For authenticated viewers, optional `election_votes` and `bookmarks` maps are included. Both are omitted for anonymous viewers and when there is no relevant data.

- `election_votes` — keyed by topic ID; present when the user has voted on one or more topics
- `bookmarks` — keyed by RSS feed ID; present when any feed on the page has a user bookmark. Each value is a map of predicate to `true` (e.g. `{ "follow": true }` or `{ "follow": true, "subscribe": true }`). Supported predicates: `follow`, `subscribe`, `mute`.

```json
{
  "results": [...],
  "page_info": { "has_next_page": false, "end_cursor": null },
  "election_votes": {
    "<topic_id>": { "entity_id": "<topic_id>", "user_id": "...", "score": 1, "created_at": "..." }
  },
  "bookmarks": {
    "<rss_feed_id>": { "follow": true }
  }
}
```
