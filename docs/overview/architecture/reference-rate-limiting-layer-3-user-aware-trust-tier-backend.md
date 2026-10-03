# Rate Limiting reference

[Back to Rate Limiting](rate-limiting.md)

## Layer 3: User-Aware Trust Tier (Backend)

General-purpose, user-aware rate limiting with thresholds that adjust based on user trust signals.

### Trust Tier (0–5)

Computed by `computeTrustTier`; see the canonical [trust-tier definition](services/user-rate-limits/README.md#trust-tier) for scoring signals and penalties. Higher trust = higher rate limits.

The [special cases](services/user-rate-limits/README.md#special-cases) define the new-account cooling period and administrator override.

### Categories

- **read** — GET endpoints
- **write** — POST/PUT/PATCH/DELETE (post creation, follows, bookmarks)
- **sensitive** — billing, account deletion, settings

### Configuration

All thresholds are runtime-configurable via DynamicConfig (Valkey-backed). Changes propagate to all backend instances via pub/sub without deploys.

- Admin API: `GET/PATCH /api/v1/dynamic-config/namespaces/rate-limit-thresholds`
- Enforcement uses Layer 4's sole
  [`route-rate-limit-config.enabled` kill switch](rate-limiting.md#layer-4-per-route-rate-limiting-backend).

Public contribution creation limits are configured separately in DynamicConfig namespace
`contribution-rate-limits`; see [Contribution Limits](../../requirements/trust-safety/CONTRIBUTION-LIMITS.md).

### Default Thresholds (per 60s)

A request is blocked when the counter reaches the threshold, so threshold N allows N-1 requests through before blocking the Nth.

| Tier | Read | Write | Sensitive |
| ---- | ---- | ----- | --------- |
| 0    | 180  | 15    | 5         |
| 1    | 180  | 15    | 5         |
| 2    | 300  | 30    | 5         |
| 3    | 600  | 60    | 10        |
| 4    | 1000 | 100   | 15        |
| 5    | 1500 | 150   | 20        |

### Response Headers

- `X-RateLimit-Limit` — max requests per window
- `X-RateLimit-Remaining` — requests remaining in window
- `Retry-After` — window size in seconds; actual wait may be shorter with the sliding window (429 responses only)

### Frontend Handling

429 responses extract the `Retry-After` header and show a user-friendly toast: "Too many requests. Please wait N seconds and try again."

**Files:** `backend/services/user-rate-limits/`, `web/lib/api/rate-limit-error.ts`
