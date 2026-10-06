# Route Rate Limits

Source entrypoint: [backend/services/route-rate-limits/README.md](../../../../../backend/services/route-rate-limits/README.md)

Per-route rate limiting with composite identity tracking across IP, device, session, user, and API key dimensions.

## Architecture

### Two-Tier Configuration

1. **Route registry** (`ROUTE_REGISTRY` in `config.mts`): static `METHOD:/path` → `{ category, multiplier?, ttlSeconds? }` map. Deploy-time defaults.
2. **DynamicConfig** (`routeRateLimitConfig`): runtime-tunable anonymous thresholds and kill switch via Valkey pub/sub.

When a request arrives: look up static registry → apply trust tier threshold (or anon threshold) × multiplier.

### Identity Dimensions

Each request generates composite Valkey keys. All dimensions are checked atomically — if **any** exceeds the threshold, the request is blocked ("most restrictive wins").

| Dimension | Key format                      | Source                  | When present                                |
| --------- | ------------------------------- | ----------------------- | ------------------------------------------- |
| IP        | `ip:{ip}:{routePrefix}`         | `ctx.ip`                | Always                                      |
| Device    | `did:{did}:{routePrefix}`       | `dt` cookie JWT         | Browser sessions                            |
| Session   | `sid:{sid}:{routePrefix}`       | `st` cookie JWT         | Browser sessions                            |
| User      | `uid:{uid}:{routePrefix}`       | `getCurrentUser()`      | Authenticated                               |
| API Key   | `apikey:{prefix}:{routePrefix}` | `Authorization: Bearer` | Machine auth (replaces device/session/user) |

### Rate Limit Thresholds

**Authenticated users**: trust tier thresholds from `@services/user-rate-limits/config` × route `multiplier`. See the canonical [trust-tier definition](../user-rate-limits/README.md#trust-tier) for scoring and special cases.

**Anonymous users**: DynamicConfig `anon_{category}` thresholds × route `multiplier`.

| Category         | Anon default | Use for                               |
| ---------------- | ------------ | ------------------------------------- |
| `read`           | 180/60s      | GET/HEAD endpoints                    |
| `write`          | 15/60s       | POST/PUT/PATCH/DELETE                 |
| `sensitive`      | 5/60s        | Auth, billing, account management     |
| `oauth_callback` | 300/60s      | Shared provider callback ingress only |

OAuth completion is a credential-bound, idempotent polling route and is explicitly classified as
`read` despite using POST. Its 180/minute anonymous default supports the advertised one-second poll
cadence without weakening the low threshold on authorization creation or other auth operations.

The provider broker callback uses a dedicated source-IP quota instead of the authenticated trust
tier or attestation multiplier. Its 300/minute default tolerates many users behind one NAT while
still bounding callback ingress. The random, single-use authorization state remains the callback's
authentication boundary; the larger quota does not make state guessable or reusable.

### Config Hierarchy

1. Per-route `ttlSeconds` override (route registry)
2. Category TTL from `@services/user-rate-limits/config` (for auth users) or DynamicConfig anon TTL

## Usage

### In Route Handlers

```typescript
// Public/optional-auth GET route
app.route('/api/v1/posts').get(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('GET:/api/v1/posts')
  // ...
})

// Auth-required POST route: call after getCurrentUser()
app.route('/api/v1/posts').post(async (ctx: Context) => {
  const currentUser = await ctx.getCurrentUser()
  ctx.assert(currentUser, 401)
  await ctx.applyRouteRateLimit('POST:/api/v1/posts')
  // ...
})
```

### Response Headers

- `X-RateLimit-Limit` — max requests per window
- `X-RateLimit-Remaining` — requests remaining
- `Retry-After` — window size in seconds (429 only)

### 429 Response

When limited, throws HTTP 429 with `Retry-After` header.

## Adding New Routes

1. **Registry** (optional): add to `ROUTE_REGISTRY` if the route needs non-default category or multiplier.
2. **Call**: add `await ctx.applyRouteRateLimit('METHOD:/api/v1/your-route')` to the handler.

Every `ROUTE_REGISTRY` entry must match an actual route and route-limit call exactly. Auth/session
routes are not optional: every non-exempt `/api/v1/auth/**` and `/api/v1/session` route must have an
exact registry entry and a matching route-helper or `ctx.applyRouteRateLimit()` call.
`POST /api/v1/auth/logout` is the only current auth exemption because users must always be able to
end a session.

Vote endpoints built with `createVoteHandler()` must also be registered with `category: 'write'`
and `multiplier: 0.5` so the lower vote threshold stays in sync with new votable entities.

### Categories

| Method                   | Default category | Override example             |
| ------------------------ | ---------------- | ---------------------------- |
| GET, HEAD                | `read`           | —                            |
| POST, PUT, PATCH, DELETE | `write`          | `sensitive` for billing/auth |

## Admin API

Runtime-tunable via DynamicConfig:

- `GET /api/v1/dynamic-config/namespaces/route-rate-limit-config` — view route rate limit config (admin only)
- `PATCH /api/v1/dynamic-config/namespaces/route-rate-limit-config` — update config fields (admin only)

**Kill switch**: `enabled` field (default: `true`). When `false`, all `applyRouteRateLimit` calls are no-ops. Malformed non-boolean values fall back to the enabled default.

**Anonymous thresholds**: `anon_read`, `anon_write`, `anon_sensitive`, `anon_oauth_callback`
(requests per window).
Invalid runtime values fall back to the built-in defaults above.

**Anonymous TTLs**: `anon_read_ttl`, `anon_write_ttl`, `anon_sensitive_ttl`,
`anon_oauth_callback_ttl` (seconds).
Invalid runtime values fall back to 60 seconds.

**ActivityPub inbox**: `activitypub_inbox_attempt_max_requests` (default `300`, range `1..10000`)
and `activitypub_inbox_attempt_window_seconds` (default `60`, range `1..3600`) limit structured
pre-verification attempts by trusted source IP. `activitypub_inbox_max_requests` (default `60`,
range `1..10000`) and `activitypub_inbox_window_seconds` (default `60`, range `1..3600`) separately
limit signature-authenticated deliveries by approved sender hostname. Both fail open and are
independent of the anonymous-route kill switch because they protect a server-to-server
authentication boundary that never carries a Voucha session.

Durable inbox workers use the delivery UUID as a stable sorted-set member. Within the active
rate-limit window, one atomic script preserves the first allow/limit decision for that delivery, so
concurrent jobs and crash retries neither inflate the hostname count nor change that decision.
Inline inbox handling keeps the ordinary per-request counter because it has no durable delivery
UUID.

## MCP usage quota

The MCP routes also draw on an outcome-based usage quota that counts only requests the API served
(2xx and 4xx; a 429 and an actual 5xx are not charged) and emits one `api_usage` analytics event
per settled request with the validated identity ids. It is separate from the attempt-based limiter
above, which still counts every attempt. `checkUsageQuota()` is a read-only pre-check and
`settleUsage()` charges the quota and emits the event once the response status is known. The quota
bucket is per owner and surface, Valkey is the only store, and no credential ever enters a key or an
event. Quota limits, units, settlement, and deferred items are documented in the
[Layer 4 reference](../../reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md#mcp-usage-quota).

## REST usage quota

`ctx.applyRouteRateLimit` meters every REST request with the same quota after the attempt-based
check passes. A signed-in user draws on their own `rest_user` allowance, keyed by user id alone, and
is refused with the MCP `429 Usage quota exceeded` once it is spent (session and sign-in routes are
never refused). Anonymous requests are charged to one `rest_anonymous` aggregate that is reported and
never enforced, with no IP, device, session, or user identifier in the key or the event. The meter
is `backend/api/rest-usage-meter.mts`, and it shares the settle-on-response-close hook in
`backend/api/usage-meter-helpers.mts` with MCP. See the
[REST usage quota reference](../../reference-rate-limiting-rest-usage-quota.md).

## Error Handling

Fails open on Valkey errors: if `addAndCheck` throws, returns `{ limited: false }` so the request proceeds. Error is reported via `onError`. The usage quota check and charge fail open the same way. The one exception is a registry entry with `failClosed: true`, currently only the two guest claimant intake routes, `POST:/api/v1/copyright-notices` (US) and `POST:/api/v1/copyright-eu-notices` (EU): when the limiter cannot be consulted those routes return `{ limited: true }` with `Retry-After` set to its window, so notice volume is never unbounded. The UK intake, staff, and redress entries stay fail-open.

## Files

- `types.mts` — type definitions
- `config.mts` — `ROUTE_REGISTRY`, `routeRateLimitConfig` DynamicConfig, threshold helpers
- `identity.mts` — `resolveRateLimitIdentities()`, `buildRateLimitKeys()`
- `check.mts` — `checkRouteRateLimit()`
- `usage-types.mts`, `usage-policy.mts`, `usage-quota.mts` — usage identity and settlement types,
  surface/plan/scope-class quota selection (including the REST route-category scope class and the
  session-route exemption), and `checkUsageQuota()` / `settleUsage()`
- `activitypub-inbox.mts` — source-IP attempt and authenticated sender-hostname limiters
- `index.mts` — barrel exports

## Related

- [User Rate Limits Service](../user-rate-limits/README.md)
- [Rate Limiting Overview](../../rate-limiting.md)
- [Dynamic Config API](../../../../requirements/api/v1/dynamic-config/README.md)
