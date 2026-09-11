# GET /api/v1/communities/:slug/agent-prompts

[Back to Community Moderation reference](reference-community-moderation-api-routes.md)

Response:

```json
{
  "community_agent_prompts": [...],
  "slot_info": {
    "used": 1,
    "limit": 3,
    "remaining": 2,
    "limits_by_plan": { "plus": 3, "pro": 10 }
  }
}
```
