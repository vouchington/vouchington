# POST /api/v1/communities/:slug/automod/simulate

[Back to Community Moderation reference](reference-community-moderation-api-routes.md)

Request body:

```json
{
  "prompt_id": "...",
  "prompt": "Optional prompt override.",
  "time_window_hours": 168,
  "limit": 25
}
```

Response:

```json
{
  "simulation": {
    "prompt_id": "...",
    "time_window_hours": 168,
    "sample_count": 25,
    "would_flag_count": 2,
    "would_unpublish_count": 0,
    "false_positive_estimate": {
      "historical_flagged_count": 10,
      "historical_approved_count": 1,
      "rate": 0.1
    }
  },
  "results": [
    {
      "post_id": "...",
      "title": "Example post",
      "post_type": "discussion",
      "approved_at": "2026-06-01T00:00:00.000Z",
      "content_excerpt": "Example post content...",
      "flagged": true,
      "reason": "Matches the prompt.",
      "would_unpublish": false
    }
  ]
}
```

Simulation samples approved, non-unpublished community posts from the selected window. It does not save `agent_moderations`, enqueue jobs, consume prompt slots, or apply `on_flag_action`.
