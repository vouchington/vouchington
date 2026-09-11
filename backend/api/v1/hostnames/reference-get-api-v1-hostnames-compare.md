# GET /api/v1/hostnames/compare

[Back to Hostnames API](README.md#get-apiv1hostnamescompare)

Compare up to 10 domains side-by-side for vote counts, trust badges, and reputation.

Query parameters:

- `ids` — comma-separated hostname IDs (max 10)

Response:

```json
{
  "hostnames": { "...": { "id": "...", "hostname": "...", "topic_id": "..." } },
  "hostname_elections": { "...": { "votes_score_net": 5, "votes_count_up": 8, "votes_count_down": 3, ... } }
}
```
