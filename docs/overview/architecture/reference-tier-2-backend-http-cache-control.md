# Tier 2: Backend HTTP Cache-Control

[Back to Caching Strategy reference](reference-caching-strategy-cache-tiers.md#tier-2-backend-http-cache-control)

Set on responses for logged-out users only. Config: `backend/config/http-cache.mts`.
Optional-auth routes that set public anonymous cache headers should also emit
`Vary: Cookie, Authorization` so direct-origin and intermediary caches keep authenticated request
variants separate. Independently, the Worker gateway adds those tokens to every anonymous backend
response so a missed route-level header cannot make a browser reuse anonymous JSON after sign-in.

| Response type                                                                                                  | Header                | TTL                                      |
| -------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------- |
| Lists/search (`/api/v1/posts`, `/api/v1/topics`, `/api/v1/urls`, `/api/v1/hostnames`, etc.)                    | `public, max-age=60`  | `HTTP_CACHE_SHORT_MAX_AGE_SECONDS` (60s) |
| Single entities (`/api/v1/posts/:id`, `/api/v1/topics/:id`, `/api/v1/urls/:id`, `/api/v1/hostnames/:id`, etc.) | `public, max-age=300` | `HTTP_CACHE_LONG_MAX_AGE_SECONDS` (300s) |
