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
  "openai_moderation": {
    "flagged": true,
    "results": [
      {
        "flagged": true,
        "categories": { "harassment": true, "violence": false }
      }
    ]
  }
}
```

`openai_moderation.results` contains the stored raw provider result object or array when moderation
has run, and is `null` when the post has no stored provider results. This field is available only
through this authorized moderation-results route; general post responses do not expose it.
