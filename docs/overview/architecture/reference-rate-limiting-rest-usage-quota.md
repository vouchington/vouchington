# Rate Limiting reference

[Back to Rate Limiting](rate-limiting.md)

## REST usage quota

`ctx.applyRouteRateLimit`, the shared REST boundary of
[Layer 4](reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md), meters every REST
request against the same outcome-based quota as
[MCP](reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md#mcp-usage-quota), so no
route is edited one at a time. It runs after the attempt-based check: a request that check refused
(its 429 reads `Rate limit exceeded`) is never a usage event and is never charged. The units table,
settlement on response close, and `api_usage` event of the MCP section apply unchanged, so a served
2xx or 4xx is one unit and an actual 5xx is none. A route that calls `applyRouteRateLimit` more than
once is still metered once per request.

- **Surfaces**: `rest_user` for a request with a valid signed session, `rest_anonymous` for every
  other request, including the IP-only OAuth routes (`/register`, `/token`, `/revoke`).
- **Signed-in users**: the bucket is `rate-limiter:usage-quota:{rest_user:user:<userId>}`, keyed by
  the user id in the signed session claims and nothing else; no session, device, or IP appears in
  it. The scope class comes from the route category: `read` is read-class, and `write`,
  `sensitive`, and `oauth_callback` are write-class. The plan is the owner's membership plan. It is
  read from the user the route already loaded, or else by id from the read pool, so a route that
  loads no user pays one extra read. A failed read costs the plan tier (the request is metered as
  `free`), never the request.

  | Surface                      | Read-class routes | Write-class routes |
  | ---------------------------- | ----------------- | ------------------ |
  | `rest_user` (free)           | 3600              | 900                |
  | `rest_anonymous` (reference) | 36000             | 9000               |

  `plus` multiplies the `rest_user` limit by 2 and `pro` by 4. The values are provisional
  constants in `usage-policy.mts`, not DynamicConfig fields.

- **Enforcement for signed-in users**: a read-only check before the route runs. An exhausted
  quota returns the same `429 Usage quota exceeded` as MCP: `Retry-After` is the full window, no
  `X-RateLimit-*` headers are sent, and the refusal is a zero-unit usage event. Session and sign-in
  routes (`/api/v1/session`, `/api/v1/auth/*`) are metered but never refused, so a user who
  spent their allowance can still refresh, sign out, and sign in.
- **Anonymous requests**: nothing privacy-safe tells anonymous callers apart. A hashed IP is still
  a pseudonymous identifier and a device id names one device, so neither is persisted. Every
  anonymous request is charged to one aggregate bucket,
  `rate-limiter:usage-quota:{rest_anonymous:aggregate}`, and its event carries
  `credential: 'anonymous'` with no user id, IP, device id, or session id. The aggregate is
  reported and never enforced, because a shared cap would let a few clients lock every anonymous
  caller out; its `quota_limit` is a reference level only. Per-caller anonymous fairness stays with
  the attempt-based limit, which keys on `ip`, `did`, and `sid` and is unchanged. The aggregate is
  one hot key whose set holds a member per charged request of the last 15 minutes (each add trims
  older ones), so it grows with anonymous traffic; revisit with sampling or a counter if volume
  warrants.
- **Kill switch**: `enabled: false` makes `applyRouteRateLimit` a no-op, so REST metering is off
  entirely: nothing is charged and no event is emitted. MCP still emits its event.

The meter is `backend/api/rest-usage-meter.mts`. It shares the settle-on-response-close hook in
`backend/api/usage-meter-helpers.mts` with the MCP routes, and the quota, policy, and settlement
code in `backend/services/route-rate-limits/`.
