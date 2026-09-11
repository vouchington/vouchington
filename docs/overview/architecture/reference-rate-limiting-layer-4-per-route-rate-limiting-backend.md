# Rate Limiting reference

[Back to Rate Limiting](rate-limiting.md)

## Layer 4: Per-Route Rate Limiting (Backend)

Per-route rate limiting with composite identity tracking across IP, device, session, user, and API key dimensions. Applied at the route handler level via `ctx.applyRouteRateLimit()`.
Standard required-auth helpers apply the per-route limit before returning `401 Unauthorized` for
anonymous requests, so logged-out traffic cannot bypass route quotas.

### Identity Dimensions

Each request generates composite Valkey keys. All dimensions are checked atomically — if **any** exceeds the threshold, the request is blocked ("most restrictive wins").

| Dimension | Key format                        | Source                      | When present                                |
| --------- | --------------------------------- | --------------------------- | ------------------------------------------- |
| IP        | `ip:{ip}:{routePrefix}`           | trusted worker-forwarded IP | Always                                      |
| Device    | `did:{did}:{routePrefix}`         | `dt` cookie JWT             | Browser sessions                            |
| Session   | `sid:{sid}:{routePrefix}`         | `st` cookie JWT             | Browser sessions                            |
| User      | `uid:{uid}:{routePrefix}`         | verified session JWT        | Authenticated                               |
| API Key   | `apikey:{id}:{routePrefix}`       | validated API key context   | Machine auth (replaces device/session/user) |
| Email     | `email:{sha256_16}:{routePrefix}` | `extras.email` param        | Auth routes that pass email as extra key    |

### Two-Tier Configuration

1. **Route registry** (`ROUTE_REGISTRY` in `backend/services/route-rate-limits/config.mts`): static `METHOD:/path` → `{ category, multiplier?, ttlSeconds? }` map. Deploy-time defaults.
2. **DynamicConfig** (`routeRateLimitConfig`): runtime-tunable anonymous thresholds and kill switch via Valkey pub/sub.

When a request arrives: look up static registry → apply trust tier threshold (or anon threshold) × multiplier.
Routes that do not need a non-default category, multiplier, or TTL can use method fallback, but
registry entries must exactly match live route paths and route-limit calls. Auth/session endpoints
and `createVoteHandler()` vote endpoints have static drift tests for required exact coverage.

### Thresholds

**Authenticated users**: trust tier thresholds from Layer 3 × route `multiplier`.

**Anonymous users**: DynamicConfig `anon_{category}` thresholds × route `multiplier`.

| Category         | Anon default | Use for                               |
| ---------------- | ------------ | ------------------------------------- |
| `read`           | 180/60s      | GET/HEAD endpoints                    |
| `write`          | 15/60s       | POST/PUT/PATCH/DELETE                 |
| `sensitive`      | 5/60s        | Auth, billing, account management     |
| `oauth_callback` | 300/60s      | Shared provider callback ingress only |

The OAuth authorization completion POST is an explicit `read` exception. While an exchange is
pending, clients follow its `Retry-After: 1` response for up to the ten-minute authorization
lifecycle; the credential-bound, idempotent route therefore receives the 180/minute anonymous read
quota. Authorization creation and other auth mutations remain `sensitive`. The provider broker
callback instead uses a dedicated, dynamically configurable 300-per-60-second source-IP quota,
independent of authenticated trust tiers and attestation multipliers. This avoids exhausting a
shared five-request bucket for users behind one NAT while the random, single-use state remains the
callback authentication boundary.

### Admin API

- `GET /api/v1/dynamic-config/namespaces/route-rate-limit-config` — view config (admin only)
- `PATCH /api/v1/dynamic-config/namespaces/route-rate-limit-config` — update config fields (admin only)

The same namespace owns the ActivityPub inbox's pre-verification attempt limits:
`activitypub_inbox_attempt_max_requests` defaults to 300 structured attempts per trusted source IP
and `activitypub_inbox_attempt_window_seconds` defaults to 60 seconds. After required headers and a
parseable claimed hostname, the route atomically charges this bucket before allowlist, body, actor
fetch, or signature work. This prevents spoofed hostnames from creating independent unauthenticated
buckets. It also owns the signature-authenticated sender limits:
`activitypub_inbox_max_requests` defaults to 60 accepted deliveries per hostname and
`activitypub_inbox_window_seconds` defaults to 60 seconds. Both take effect through DynamicConfig
without a deploy. The inbox checks an existing authenticated-hostname bucket before reading the
body and increments it only after the HTTP signature verifies, so invalid signatures consume the
attempt bucket but not the valid-delivery allowance. Both limiter scopes report failures and fail
open.
Because the edge sees only a shared egress IP rather than the authenticated remote hostname, exact
`POST /ap/inbox` does not consume either Cloudflare mutating bucket. This is not a federation-wide
exemption: the classifier requires the exact method and path, and the backend charges its trusted
source-IP attempt bucket before expensive work, then charges the hostname delivery bucket only
after signature verification succeeds.

- **Kill switch**: `enabled` field (default: `true`). When `false`, all `applyRouteRateLimit` calls are no-ops. Malformed non-boolean values fall back to the enabled default.

### Response Headers

- `X-RateLimit-Limit` — max requests per window
- `X-RateLimit-Remaining` — requests remaining
- `Retry-After` — window size in seconds (429 only)

### Exemptions

`POST /api/v1/auth/logout` is exempt from backend per-route rate limiting. Logout must clear or
revoke the current session even if the browser or IP has already exhausted mutating-route buckets.

**Files:** `backend/services/route-rate-limits/`, `backend/api/context/rate-limit.mts`

**CF Worker bindings**: staging declares the shared GET/HEAD, mutating, and nested Server Action
bindings in the private Worker deployment manifest; Filaments is not their source of
truth.
