# Friend Recommendations API

## GET /api/v1/my/friend-recommendations

Returns friend recommendations for the current user based on mutual connections from OAuth providers (Facebook, X, GitHub).

### Authentication

Requires authentication. Returns 401 if not logged in.

### Query Parameters

| Parameter | Type    | Default | Description                                     |
| --------- | ------- | ------- | ----------------------------------------------- |
| `after`   | string  | —       | Opaque cursor for pagination (from `page_info`) |
| `limit`   | integer | 25      | Number of results per page (1–100)              |

### Response

```json
{
  "results": [
    {
      "__entity_type": "user",
      "id": "uuid",
      "provider": "facebook",
      "provider_friend_name": "Alice"
    }
  ],
  "page_info": {
    "has_next_page": true,
    "end_cursor": "base64cursor",
    "start_cursor": "base64cursor"
  },
  "users": {
    "uuid": { "__entity_type": "user", "id": "uuid", "username": "alice", ... }
  }
}
```

### Fields

- `results[].provider` — one of `facebook`, `x`, `github`
- `results[].provider_friend_name` — the user's display name on that provider
- `users` — resolved user objects keyed by ID

## Performance

| Endpoint                              | Round Trips | Caching                | Notes                                                           |
| ------------------------------------- | ----------- | ---------------------- | --------------------------------------------------------------- |
| GET /api/v1/my/friend-recommendations | 2           | Entities: Valkey batch | Recommendations query, then parallel streaming (user hydration) |

## Related

- Service: [../../services/friend-recommendations/](../../../services/friend-recommendations/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
