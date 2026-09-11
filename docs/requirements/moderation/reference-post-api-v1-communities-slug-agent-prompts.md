# POST /api/v1/communities/:slug/agent-prompts

[Back to Community Moderation reference](reference-community-moderation-api-routes.md)

Request body:

```json
{
  "prompt": "Flag posts containing hate speech or personal attacks.",
  "model_name": "gpt-5.4-nano",
  "model_provider": "openai"
}
```

Response (201):

```json
{
  "community_agent_prompt": {
    "id": "...",
    "community_id": "...",
    "created_by_id": "...",
    "prompt": "...",
    "model_name": "gpt-5.4-nano",
    "model_provider": "openai",
    "slot_allocated": false,
    "activated_at": null,
    "deactivated_at": null,
    "created_at": "...",
    "updated_at": "..."
  }
}
```
