# Agents API

Endpoints for viewing AI agents and their conversation history.

## Endpoints

| Method | Route                                                    | Authentication          | Description                                                        |
| ------ | -------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| GET    | `/api/v1/agents`                                         | Required (agent viewer) | List agents (paginated)                                            |
| GET    | `/api/v1/agents/:idOrSlug`                               | Required (agent viewer) | Get agent by ID or slug                                            |
| GET    | `/api/v1/agents/:idOrSlug/conversations`                 | Required (agent viewer) | List conversations for an agent                                    |
| GET    | `/api/v1/agents/:idOrSlug/conversations/:conversationId` | Required (agent viewer) | Get conversation detail with messages                              |
| GET    | `/api/v1/agent-moderations/:id/votes`                    | Required (admin)        | List moderation-accuracy votes (admins list all voters, paginated) |

## Authorization

All endpoints require the agent viewer permission (`currentUserCanViewAgents`). Returns 401 if unauthenticated, 403 if authenticated but unauthorized.

### GET /api/v1/agents

Query parameters:

- `after` — cursor for pagination
- `limit` — results per page (1–100, default 25)

Response includes `results`, `page_info`, and a `users` map (system users associated with agents).

### GET /api/v1/agents/:idOrSlug/conversations

Query parameters:

- `after` — cursor for pagination
- `limit` — results per page (1–100, default 25)
- `user_id` — filter by user ID
- `username` — filter by username
- `post_id` — filter by post ID
- `post_slug` — filter by post slug
- `rss_feed_item_id` — filter by RSS feed item UUID

Response includes `results`, `page_info`, and a `users` map.

### GET /api/v1/agents/:idOrSlug/conversations/:conversationId

Response includes `conversation`, `results`, and `page_info`.

### GET /api/v1/agent-moderations/:id/votes

Admin only (returns 403 for non-admins). Lists votes for the moderation's accuracy election.

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`; advances to the next page. Returns 400 for an invalid or cross-resource cursor.
- `limit` — results per page (1–100, default 100)

Response includes `results` and `page_info`.

## Performance

| Endpoint                                                   | Round Trips | Caching                | Notes                                                   |
| ---------------------------------------------------------- | ----------- | ---------------------- | ------------------------------------------------------- |
| GET /api/v1/agents                                         | 2           | Entities: Valkey batch | Search, then parallel streaming (users)                 |
| GET /api/v1/agents/:idOrSlug                               | 2           | None                   | Auth, single agent lookup                               |
| GET /api/v1/agents/:idOrSlug/conversations                 | 3           | Entities: Valkey batch | Auth, agent lookup, search + parallel streaming (users) |
| GET /api/v1/agents/:idOrSlug/conversations/:conversationId | 4           | None                   | Auth, agent lookup, conversation lookup, messages query |
| PUT /api/v1/agent-moderations/:id/vote                     | 4           | Entities: Valkey batch | Standard vote handler; admin only                       |
| GET /api/v1/agent-moderations/:id/votes                    | 3           | Entities: Valkey batch | Auth, cached entity lookup, votes query; admin only     |

## Related

- Service: [../../services/agents/](../../../services/agents/README.md)
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
