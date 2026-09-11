# GET /api/v1/hostnames/top

[Back to Hostnames API](README.md#get-apiv1hostnamestop)

List top trusted domains across all topics, ranked by net vote score (`votes_score_net DESC`).

Query parameters:

- `limit` — max results (1-100, default: 25)
- `after` — cursor for pagination
- `topic` — filter to specific topic by UUID, slug, or alias (optional; defaults to all topics)

Response:

```json
{
  "results": [
    { "__entity_type": "hostname", "id": "..." }
  ],
  "page_info": { "has_next_page": false, "end_cursor": "..." },
  "hostnames": { "...": { "id": "...", "hostname": "...", "topic_id": "..." } },
  "hostname_elections": { "...": { "votes_score_net": 5, ... } },
  "topics": { "...": { "name": "...", ... } },
  "top_urls_by_hostname_id": { "...": [{ "id": "...", "url": "..." }] }
}
```
