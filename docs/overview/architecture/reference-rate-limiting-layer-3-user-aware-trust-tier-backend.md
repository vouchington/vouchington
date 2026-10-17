# Rate Limiting reference

[Back to Rate Limiting](rate-limiting.md)

## Layer 3: User-Aware Trust Tier (Backend)

General-purpose, user-aware rate limiting with thresholds that adjust based on user trust signals.

### Trust Tier

Computed by `computeTrustTier`; see the canonical trust-tier definition for scoring signals and penalties. Higher trust = higher rate limits.

The special cases define the new-account cooling period and administrator override.

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
`contribution-rate-limits`; see Contribution Limits.

Thresholds are per tier and category and live in DynamicConfig defaults. A request is blocked when the counter reaches the threshold.

### Frontend Handling

429 responses surface a user-friendly toast built from `Retry-After`.

**Files:** `backend/services/user-rate-limits/`, `web/lib/api/rate-limit-error.ts`
