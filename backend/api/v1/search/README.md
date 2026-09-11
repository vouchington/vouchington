# Search API

Combined omnisearch endpoint — one request fans out across all five entity verticals
(topics, posts, news, domains, communities) and returns a lightweight merged payload.

Used by the command-search dialog when the `combinedSearch` feature flag is enabled.
When the flag is off the dialog fans out to the five individual entity endpoints instead.

## Endpoints

| Method | Route            | Authentication | Description                      |
| ------ | ---------------- | -------------- | -------------------------------- |
| GET    | `/api/v1/search` | Optional       | Combined search across all types |

## GET /api/v1/search

Query parameters:

- `q` — search query string; supports `#topic-name` hashtag mentions. A linked topic filters
  topics, posts, news, and communities; an unlinked alias filters posts and news exactly. An
  unknown hashtag returns no results, and verticals without the relevant hashtag filter do not
  return text-only matches.
- `limit` — per-vertical result cap (default 3, max 25 for anon)

Response shape (intentionally differs from the standard `{ results, page_info }` wrapper — this
endpoint aggregates five distinct entity types, not a single-type paginated list; each key IS the
"results" for its vertical; only the fields the command-search dialog renders are included):

```jsonc
{
  "topics":      [{ "id", "name", "slug", "topic_type" }],
  "posts":       [{ "id", "post_type", "title", "authored_title", "declared_language", "lingua_rs_detected_language" }],
  "news":        [{ "id", "url", "title", "feed_title" }],
  "domains":     [{ "id", "hostname" }],
  "communities": [{ "id", "name", "slug", "bookmarked" }]
}
```

A failing vertical degrades to `[]` for that key; the remaining verticals are unaffected.

Post `title` remains the UI-safe display fallback. `authored_title` is null for an empty title;
when non-null, clients render it with the nullable declared/detected content-language pair.

## Performance

| Endpoint           | Round Trips | Caching                                                                                            | Notes                                                                                                                 |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET /api/v1/search | 3–5         | Search: anon Valkey per vertical; Entities: Valkey batch (posts, news); HTTP: Cache-Control (anon) | 5 parallel vertical searches + batch hydration for posts (title) and news (full item); bookmarks for auth communities |

## Related

- Service: [../../../services/search/](../../../services/search/omnisearch.mts)
- Command search dialog: [../../../../web/components/command-search.tsx](../../../../web/components/command-search.tsx)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
