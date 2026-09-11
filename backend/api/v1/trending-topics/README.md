# Trending Topics API

Discover trending topics by time range.

## Endpoints

| Method | Route                     | Authentication | Description         |
| ------ | ------------------------- | -------------- | ------------------- |
| GET    | `/api/v1/trending-topics` | Optional       | Get trending topics |

## GET /api/v1/trending-topics

Returns topics ranked by trending score over a configurable time window.

Query parameters:

- `after` — cursor for pagination (score-based)
- `limit` — 1–100, default 20
- `time_range` — `day` (default), `week`, or `month`
- `min_score` — minimum trending score filter (≥ 0)

Response is streamed and includes: `results`, `page_info`, `topics`, `topics_metrics`. For authenticated users also: `bookmarks`.

Cached (short TTL) for unauthenticated users.

## Performance

| Endpoint                    | Round Trips | Caching                                                       | Notes                                                    |
| --------------------------- | ----------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| GET /api/v1/trending-topics | 2           | Search: anon Valkey; Entities: Valkey batch; HTTP: short anon | Search → parallel streaming (topics, metrics, bookmarks) |

## Related

- Service: [../../services/trending-topics/](../../../services/trending-topics/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
