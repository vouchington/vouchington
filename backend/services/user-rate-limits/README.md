# User Rate Limits

Owns authenticated-user trust tiers and the dynamic thresholds consumed by
[`@services/route-rate-limits`](../route-rate-limits/README.md).

## Trust Tier

Each authenticated user has a trust tier (0–5) embedded in their session JWT (`tt` claim). It is computed at cold-path session refresh by `computeTrustTier()` and cached for the lifetime of the JWT.

### Score table

| Signal                            | Delta |
| --------------------------------- | ----- |
| Has any OAuth account             | +1    |
| Account age > 30 days             | +0.5  |
| Account age > 6 months            | +1    |
| Account age > 1 year              | +1.5  |
| Plus membership                   | +1    |
| Pro membership                    | +1.5  |
| Identity verified                 | +1    |
| Active bad-faith reporter penalty | -2    |

Base score is 1. Age bonuses are exclusive (highest applicable only). Final tier = `clamp(floor(score), 0, 5)`.
The bad-faith reporter penalty is applied when `users.bad_faith_reporter_at IS NOT NULL`, which is set by `applyReportAbusePenalty` in `@services/report-integrity`.

### Special cases

| Condition              | Tier |
| ---------------------- | ---- |
| Account < 24 hours old | 0    |
| Administrator role     | 5    |

New accounts are hard-clamped to tier 0 regardless of OAuth or membership — this is the 24-hour cooling period that prevents fresh accounts from immediately getting elevated limits. Admins bypass all scoring and always receive tier 5.

### Tier breakdown

| Tier | Profile                                                           |
| ---- | ----------------------------------------------------------------- |
| 0    | Brand-new account (< 24 h) — most restrictive limits              |
| 1    | Established account, no linked auth, no membership                |
| 2    | OAuth linked, or 6-month-old account, or plus member              |
| 3    | OAuth + 6-month account, or pro member                            |
| 4    | Plus member + OAuth + 6-month account (or equivalent combination) |
| 5    | Pro member + OAuth + 1-year account, or administrator             |

### Edge rate-limit tiers

The Cloudflare Worker maps `tt` to coarser identity tiers for edge rate limiting:

| CF tier   | Criteria                                             |
| --------- | ---------------------------------------------------- |
| `premium` | `tt ≥ 4`, OR `mpl = pro/plus`, OR administrator role |
| `auth`    | Authenticated, `tt` 0–3                              |
| `anon`    | No valid session                                     |

## Route Rate Limit Categories

| Category    | Use Case                                             |
| ----------- | ---------------------------------------------------- |
| `read`      | GET endpoints                                        |
| `write`     | POST/PUT/PATCH/DELETE (post creation, follows, etc.) |
| `sensitive` | Billing, account deletion, settings changes          |

## DynamicConfig Schema

All thresholds are runtime-configurable via `DynamicConfig` key `rate-limit-thresholds`:

- `{category}_tier{0-5}` — rate limit threshold per window: a request is blocked when the counter reaches this value, so threshold N allows N-1 requests through before blocking the Nth (number)
- `{category}_ttl` — window duration in seconds (number)

Admin API: `GET/PATCH /api/v1/dynamic-config/namespaces/rate-limit-thresholds` (admin only).

## Usage

```typescript
import { checkRouteRateLimit } from '@services/route-rate-limits'

const result = await checkRouteRateLimit(routeKey, identities, currentUser)
// result: { limited, retryAfterSeconds, limit, remaining }
```

Routes apply these thresholds through the route-rate-limit service, which owns counter identities,
route multipliers, response headers, and 429 responses. This package does not own a second
standalone rate-limiter path.

## Context Caching

Trust tier context (membership plan) is cached in Valkey for 5 minutes to avoid DB queries per request.

## Response Headers

When rate limiting is enabled, routes set:

- `X-RateLimit-Limit` — max requests per window
- `X-RateLimit-Remaining` — requests remaining
- `Retry-After` — seconds until window resets (only on 429)

## Related

- [Route Rate Limits Service](../route-rate-limits/README.md)
- [Rate Limiting Overview](../../../docs/overview/architecture/rate-limiting.md)
- [Trust System Requirements](../../../docs/requirements/trust-safety/trust-system.md)
