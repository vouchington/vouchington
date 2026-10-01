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

The MCP routes (`POST /api/v1/mcp` and `POST /api/v1/admin/mcp`) do not emit `X-RateLimit-*`
headers; their 429 responses carry an authoritative `Retry-After`.

### MCP usage quota

The two MCP routes add an outcome-based quota on top of the attempt-based limit above. The
attempt-based limit is unchanged and still counts every request, including rejected ones, so abuse
protection covers all traffic. The usage quota counts only requests the API served, so a client is
never charged for a failure that was ours. Valkey is the only store: there is no usage table and no
durable ledger.

| Response status    | Units charged | Why                                 |
| ------------------ | ------------- | ----------------------------------- |
| 2xx                | 1             | Served                              |
| 4xx other than 429 | 1             | Served; the caller caused the error |
| 429                | 0             | Refused before it ran               |
| 5xx                | 0             | The API's failure                   |

- **Unit**: one HTTP request. A JSON-RPC batch is one unit.
- **Settlement**: the quota is charged, and the usage event emitted, when the response closes,
  because only then is the real status known. A client that disconnects before any response header
  was sent has no status and is skipped.
- **Bucket**: `rate-limiter:usage-quota:{<surface>:user:<userId>}`, a 15-minute sliding window per
  owner and surface. Every API key and OAuth grant of one user draws on one allowance, so minting
  more credentials does not widen it. No key, token, or credential hash appears in the bucket id.
- **Quota selection**: surface, plan, and scope class choose the limit from code constants in
  `usage-policy.mts`. A credential is write-class when any scope it holds has a `write` action,
  whatever resource it names. The plan is the owner's membership plan (`free` when none).

  | Surface            | Read scopes | Write-capable scopes |
  | ------------------ | ----------- | -------------------- |
  | `mcp_user` (free)  | 900         | 450                  |
  | `mcp_admin` (free) | 1800        | 900                  |

  `plus` multiplies the limit by 2 and `pro` by 4. The values are provisional constants, not
  DynamicConfig fields.

- **Enforcement**: a read-only check runs before the call. An exhausted quota returns `429 Usage
quota exceeded` with `Retry-After` set to the full window (900 seconds), records an MCP audit
  entry with outcome `rate_limited`, and is not charged. Because the charge happens after the
  response, concurrent in-flight requests can overshoot the limit by at most their own number. The
  check fails open on a Valkey error and reports it through `onError`. The `enabled` kill switch
  turns off enforcement and charging; the usage event is still emitted.
- **Metrics**: each settled request emits one typed `api_usage` analytics event (see the
  [table registry](reference-analytics-pipeline-table-registry.md)) carrying the validated user id,
  API key id or OAuth client id and grant id, plan, scope class, units, status, quota, and
  duration. The raw bearer token is never read by the metering code.
- **Model requests**: no model call is made through MCP or the API today, so there are no token
  counts and none are invented. Model request recording would reuse the existing redacted,
  access-controlled object-recording path when such a call exists.
- **Deferred**: per-OAuth-client buckets and the structured `RateLimit-Policy` / `RateLimit`
  headers belong to the Public REST API milestone. REST session-user and anonymous metering is not
  part of this layer yet.

The Firehose stream and S3 Tables table for `api_usage` are provisioned in the infra repository
([#1556](https://github.com/vouchington/vouchington/issues/1556)). Until they exist, the
`firehose` backend reports a delivery error for each batch of `api_usage` rows; the `local`
backend is unaffected.

### Exemptions

`POST /api/v1/auth/logout` is exempt from backend per-route rate limiting. Logout must clear or
revoke the current session even if the browser or IP has already exhausted mutating-route buckets.

**Files:** `backend/services/route-rate-limits/`, `backend/api/context/rate-limit.mts`,
`backend/api/mcp-usage-helpers.mts`

**CF Worker bindings**: staging declares the shared GET/HEAD, mutating, and nested Server Action
bindings in the private Worker deployment manifest; Vouchington is not their source of
truth.
