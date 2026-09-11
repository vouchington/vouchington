# GET /api/v1/hostnames/social

[Back to Hostnames API](README.md#get-apiv1hostnamessocial)

List trusted domains from users the current user follows (ranked by friend upvote count).

**Unauthorized.**

Query parameters:

- `limit` — max results (1-100, default: 25)
- `after` — cursor for pagination

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
  "social_by_hostname_id": {
    "...": { "friend_upvote_count": 3, "friend_voter_ids": ["user-id-1", "user-id-2"] }
  }
}
```
