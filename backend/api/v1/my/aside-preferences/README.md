# My Aside Preferences API

Manage the current user's dismissed aside widget preferences.

## Endpoints

| Method | Route                                    | Authentication | Description                   |
| ------ | ---------------------------------------- | -------------- | ----------------------------- |
| GET    | `/api/v1/my/aside-preferences`           | Required       | List all dismissed asides     |
| POST   | `/api/v1/my/aside-preferences`           | Required       | Dismiss an aside              |
| DELETE | `/api/v1/my/aside-preferences/:asideKey` | Required       | Restore (un-dismiss) an aside |

## POST /api/v1/my/aside-preferences

Request body: `{ aside_key }` — key identifying the aside widget (e.g. `trending-topics`, `connect-social`).

Response: 204 No Content (idempotent — re-dismissing an already-dismissed aside is a no-op)

## DELETE /api/v1/my/aside-preferences/:asideKey

Removes the dismissed preference, causing the aside to reappear.

Response: 204 No Content

## Performance

| Endpoint                                      | Round Trips | Notes                              |
| --------------------------------------------- | ----------- | ---------------------------------- |
| GET /api/v1/my/aside-preferences              | 1           | List all dismissed aside keys      |
| POST /api/v1/my/aside-preferences             | 1           | Upsert (ignored if already exists) |
| DELETE /api/v1/my/aside-preferences/:asideKey | 1           | Delete preference row              |

## Related

- Service: [../../../../services/aside-preferences/README.md](../../../../services/aside-preferences/README.md)
