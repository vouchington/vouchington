# Rate Limiting reference

[Back to Rate Limiting](rate-limiting.md)

## Layer 1: Cloudflare Worker (Edge)

IP-level rate limiting at the CDN edge before requests reach the backend.

- Separate method-class buckets: `GET` is shared by GET/HEAD, and `MUTATING` is shared by every other method
- Separate buckets for `/api/*` vs. web routes, with API prefix matching evaluated case-insensitively
- Backend-bound worker prefixes such as `/api/*`, `/infra/*`, `/md/*`, and `/rss/*` are classified case-insensitively before origin routing
- Inline responses and fully cached GETs that can dispatch to Workers Cache bypass rate limiting unless staging Basic Auth applies; covered staging Basic Auth requests consume the generic identity limiter before credential validation
- HEAD, Bearer, RSC, and other cache-bypassed requests remain limited
- Key format: `{area}:{methodClass}:{ip}` (identity keys add the `anon` or `server-action` tier prefix)
- A web Server Action POST consumes the generic mutating quota first and then its stricter Server Action quota; `/api/*` requests carrying `next-action` remain generic mutations
- Exact `POST /ap/inbox` bypasses both generic and unknown-bot edge mutating buckets so the backend's DynamicConfig source-IP attempt limiter plus approved-hostname, HTTP-signature, and authenticated-hostname limiter are authoritative; wrong methods, trailing slashes, and neighboring paths remain edge-limited

**Config:** Staging declares `RATE_LIMITER_GET_HEAD`, `RATE_LIMITER_MUTATING`, and
`RATE_LIMITER_SERVER_ACTION` in the private Worker deployment manifest. Optional anonymous and bot
bindings fall back to the matching shared method-class binding when absent.

**File:** `cloudflare-worker/src/rate-limit.mts`

## Layer 2: Per-Endpoint (Backend)

Endpoint-specific rate limiters for high-risk operations:

| Endpoint            | Threshold                              | Window   | Keys                                                         |
| ------------------- | -------------------------------------- | -------- | ------------------------------------------------------------ |
| Email login token   | 5/min                                  | 60s      | email, IP, device, session                                   |
| Email login verify  | 10/min                                 | 60s      | email, IP, device, session                                   |
| MFA verification    | configurable + 5 failed attempts/login | 60s / 5m | IP, device, session, user, login attempt                     |
| Passkey auth/signup | configurable                           | 60s      | device, IP, session                                          |
| RSS feeds           | 3/min                                  | 60s      | identity + route, IP + route (identity = API key or anon IP) |

**Files:** `backend/services/users/authentication-flows.mts`, `backend/services/passkeys/flows.mts`, `backend/services/rss-xml/rate-limiter.mts`
