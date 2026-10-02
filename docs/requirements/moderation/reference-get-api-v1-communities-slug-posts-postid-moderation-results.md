# GET /api/v1/communities/:slug/posts/:postId/moderation-results

[Back to Community Moderation reference](reference-community-moderation-api-routes.md)

Response:

```json
{
  "community_agent_moderations": [
    {
      "id": "...",
      "post_id": "...",
      "community_prompt_id": "...",
      "flagged": true,
      "results": { "flagged": true, "confidence_score": 0.93, "confidence_threshold": 0.8 },
      "created_at": "..."
    }
  ],
  "platform_moderation": { "status": "in_review" }
}
```

`results` holds the classifier's probability (`confidence_score`) and the threshold it was judged by
(`confidence_threshold`). It carries no `reason`, because the classifier returns a probability, not
an explanation.

`platform_moderation.status` exposes only the provider-neutral coarse lifecycle. Provider identity,
raw results, and private evidence are restricted to staff review surfaces.
