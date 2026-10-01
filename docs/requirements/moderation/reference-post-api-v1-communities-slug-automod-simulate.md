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
    "community_automod_action": "record_only",
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
      "reason": "Matches the prompt."
    }
  ]
}
```

Simulation samples approved, non-unpublished community posts from the selected window. It does not save `agent_moderations`, enqueue jobs, consume prompt slots, or apply the automod action. `simulation.community_automod_action` states which action (`record_only`, `review_queue` or `unpublish`) the community currently applies to a real flag, so a moderator can read the results against it.
