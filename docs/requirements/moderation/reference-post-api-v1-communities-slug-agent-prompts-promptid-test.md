# POST /api/v1/communities/:slug/agent-prompts/:promptId/test

[Back to Community Moderation reference](reference-community-moderation-api-routes.md)

Request body:

```json
{ "text": "Sample post content to evaluate." }
```

Response:

```json
{ "flagged": false, "reason": "" }
```

Testing does not save any results or consume a slot.
