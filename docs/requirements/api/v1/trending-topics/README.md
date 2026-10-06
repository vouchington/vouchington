# Trending Topics API

Source entrypoint: [backend/api/v1/trending-topics/README.md](../../../../../backend/api/v1/trending-topics/README.md)

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

| Endpoint                    | Round Trips | Caching                                                       | Notes                                                                                                              |
| --------------------------- | ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET /api/v1/trending-topics | 3           | Search: anon Valkey; Entities: Valkey batch; HTTP: short anon | Search → parallel streaming (topics, metrics, bookmarks); provenance facts (batched) chained after the topic batch |

## Related

- Service: [../../services/trending-topics/](../../../../overview/architecture/services/trending-topics/README.md)
- Parent: [../AGENTS.md](../../../../../backend/api/AGENTS.md)
