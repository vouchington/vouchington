# GET /api/v1/web-search

Public search over crawled pages and URL strings.

## Endpoints

| Method | Path                 | Auth     | Description                                 |
| ------ | -------------------- | -------- | ------------------------------------------- |
| GET    | `/api/v1/web-search` | Optional | Search crawled page content and URL strings |

### Query Parameters

| Parameter | Type   | Default | Description                                         |
| --------- | ------ | ------- | --------------------------------------------------- |
| `query`   | string | —       | Search query (min 3 chars; shorter returns empty)   |
| `limit`   | number | 25      | Result count; anon capped at 25, auth capped at 100 |

### Response

```json
{
  "results": [
    {
      "url": { "__entity_type": "url", "id": "...", "url": "...", "hostname": { ... } },
      "snippet": "...⟦MARK⟧highlighted term⟦/MARK⟧...",
      "match_type": "content"
    }
  ],
  "page_info": { "has_next_page": false, "start_cursor": null, "end_cursor": null }
}
```

`match_type` is `"content"` for FTS matches with a snippet, or `"url"` for URL-string matches (snippet is `null`).

## Performance

|                 |                                                           |
| --------------- | --------------------------------------------------------- |
| DB reads        | 1                                                         |
| Cache-Control   | `public, max-age=…` for anonymous; none for authenticated |
| Per-query cache | None                                                      |

Short queries (`< 3` chars) return `200` with empty results immediately (no DB hit).
