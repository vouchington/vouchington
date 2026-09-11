# Trending Communities API

Discover communities ranked by member activity.

## Endpoints

| Method | Route                          | Authentication | Description              |
| ------ | ------------------------------ | -------------- | ------------------------ |
| GET    | `/api/v1/trending-communities` | Optional       | Get trending communities |

## GET /api/v1/trending-communities

Returns communities ranked by `member_count + post_count + virtual_subscription_count`.

Query parameters:

- `after` — cursor for pagination (score-based)
- `limit` — 1–50, default 10 (anonymous users capped at 25)

Response: `{ communities, page_info }`

Cached through Valkey search cache and short HTTP TTL for unauthenticated users.

## Performance

| Endpoint                         | Round Trips | Caching                               | Notes                                                                                                                          |
| -------------------------------- | ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET /api/v1/trending-communities | 1           | Search: anon Valkey; HTTP: short anon | Set-based aggregates, not `view_community_metrics`; candidates capped at 1000 by 30-day post activity — see the service README |

## Related

- Service: [../../../services/trending-communities/README.md](../../../services/trending-communities/README.md)
