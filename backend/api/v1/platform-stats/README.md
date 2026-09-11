# Platform Stats API

Public statistics about the platform.

## Endpoints

| Method | Route                    | Authentication | Description             |
| ------ | ------------------------ | -------------- | ----------------------- |
| GET    | `/api/v1/platform-stats` | Optional       | Get platform statistics |

## GET /api/v1/platform-stats

Returns aggregate platform statistics. Anonymous requests use the cached search wrapper and include `Cache-Control` headers for CDN caching. Authenticated requests bypass the cache for fresh data.

Response is streamed via `streamJsonObject`.

## Performance

| Endpoint                   | Round Trips | Caching                                         | Notes                                         |
| -------------------------- | ----------- | ----------------------------------------------- | --------------------------------------------- |
| GET /api/v1/platform-stats | 2           | Search: anon Valkey; HTTP: Cache-Control (anon) | Auth + stats query; anon responses are cached |

## Related

- Service: [../../../services/platform-stats/](../../../services/platform-stats/README.md)
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
