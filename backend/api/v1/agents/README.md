# Agent Moderation API

Agent moderation vote endpoints remain after the hosted viewer retirement.

## Endpoints

| Method | Route                                 | Authentication   | Description                                |
| ------ | ------------------------------------- | ---------------- | ------------------------------------------ |
| GET    | `/api/v1/agent-moderations/:id/votes` | Required (admin) | List moderation-accuracy votes (paginated) |

### GET /api/v1/agent-moderations/:id/votes

Admin only (returns 403 for non-admins). Lists votes for the moderation's accuracy election.

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`; advances to the next page. Returns 400 for an invalid or cross-resource cursor.
- `limit` — results per page (1–100, default 100)

Response includes `results` and `page_info`.

## Performance

| Endpoint                                | Round Trips | Caching                | Notes                                   |
| --------------------------------------- | ----------- | ---------------------- | --------------------------------------- |
| PUT /api/v1/agent-moderations/:id/vote  | 4           | Entities: Valkey batch | Standard vote handler; admin only       |
| GET /api/v1/agent-moderations/:id/votes | 3           | Entities: Valkey batch | Auth, cached entity lookup, votes query |

## Related

- Service: [../../services/agents/](../../../services/agents/README.md)
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
