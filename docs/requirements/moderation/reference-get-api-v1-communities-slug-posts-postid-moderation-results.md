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
      "results": { "flagged": true, "reason": "..." },
      "created_at": "..."
    }
  ],
  "platform_moderation": { "status": "in_review" }
}
```

`platform_moderation.status` exposes only the provider-neutral coarse lifecycle. Provider identity,
raw results, and private evidence are restricted to staff review surfaces.
