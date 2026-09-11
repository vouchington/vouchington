# Built-In AI Agents

[Back to Community Moderation reference](reference-community-moderation-api-routes.md#built-in-ai-agents)

| Method   | Path                                             | Description                       |
| -------- | ------------------------------------------------ | --------------------------------- |
| `GET`    | `/api/v1/communities/:slug/ai-agents`            | List built-in agent toggle states |
| `PUT`    | `/api/v1/communities/:slug/ai-agents/:agentSlug` | Enable a built-in agent           |
| `DELETE` | `/api/v1/communities/:slug/ai-agents/:agentSlug` | Disable a built-in agent          |

Response:

```json
{
  "community_ai_agents": [
    {
      "slug": "self-promotion",
      "agent_id": "...",
      "system_user_id": "...",
      "system_username": "self-promotion",
      "label_topic_slugs": ["self-promotion"],
      "on_flag_action": "review_queue",
      "enabled": false,
      "enabled_at": null,
      "enabled_by_id": null,
      "entitlement": { "allowed": true, "reason": null }
    }
  ]
}
```
