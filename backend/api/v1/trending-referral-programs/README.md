# Trending Referral Programs API

Discover referral programs with the most active links in the past 30 days.

## Endpoints

| Method | Route                                | Authentication | Description                    |
| ------ | ------------------------------------ | -------------- | ------------------------------ |
| GET    | `/api/v1/trending-referral-programs` | Optional       | Get trending referral programs |

## GET /api/v1/trending-referral-programs

Returns referral programs ranked by number of active `user_referral_program_links` created in the past 30 days.

Query parameters:

- `after` — cursor for pagination (score-based)
- `limit` — 1–50, default 10 (anonymous users capped at 25)

Response: `{ referral_programs, page_info }`

Cached (short TTL) for unauthenticated users.

## Performance

| Endpoint                               | Round Trips | Caching          | Notes                          |
| -------------------------------------- | ----------- | ---------------- | ------------------------------ |
| GET /api/v1/trending-referral-programs | 1           | HTTP: short anon | Aggregates link counts via CTE |

## Related

- Service: [../../../services/trending-referral-programs/README.md](../../../services/trending-referral-programs/README.md)
