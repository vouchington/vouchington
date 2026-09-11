# Recommended Topics API

Personalized topic recommendations for authenticated users.

## Endpoints

| Method | Route                        | Authentication | Description                            |
| ------ | ---------------------------- | -------------- | -------------------------------------- |
| GET    | `/api/v1/recommended-topics` | Required       | Get personalized topic recommendations |

## GET /api/v1/recommended-topics

Returns topics recommended for the current user based on their activity and preferences.

Query parameters:

- `after` — cursor for pagination
- `limit` — 1–100, default 25
- `topic_types` — filter by topic types
- `sort` — `score` or `best`
- `spending_category` — filter to spending category topics (`true`/`false`)
- `rss_feed` — filter to topics with RSS feeds (`true`/`false`)

Response is streamed and includes: `results`, `page_info`, `topics`, `topics_metrics`, `bookmarks`.

## Performance

| Endpoint                       | Round Trips | Caching                | Notes                                                                |
| ------------------------------ | ----------- | ---------------------- | -------------------------------------------------------------------- |
| GET /api/v1/recommended-topics | 3           | Entities: Valkey batch | Auth, search, then parallel streaming (topics + metrics + bookmarks) |

## Related

- Service: [../../services/recommended-topics/](../../../services/recommended-topics/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
