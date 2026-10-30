# Rate Limiting

[Back to Cloudflare Worker](README.md#rate-limiting)

Rate limiting is IP-based and operates on two dimensions:

- **Method class**: `GET` (shared by GET/HEAD) vs. `MUTATING` (shared by POST/PUT/PATCH/DELETE/etc.)
- **Area**: `/api/*` vs. `web` — the API prefix check is case-insensitive. Inline responses and fully cached GETs that can actually dispatch to Workers Cache are exempt unless staging Basic Auth applies; covered staging Basic Auth requests consume the generic identity limiter before credential validation. Geo-blocked requests are rejected before that staging gate and do not consume it. Cache-bypassed HEAD, Bearer, RSC, and misconfigured web-cache requests remain limited.

The exact delivery route `POST /ap/inbox` bypasses both the generic pre-cache mutating limiter and
the unknown-bot post-cache mutating limiter. The backend first applies a runtime-configurable
trusted-source-IP attempt limiter, then admits only approved hostnames, verifies the HTTP signature,
and applies the separate runtime-configurable authenticated-hostname ActivityPub inbox limiter;
wrong methods, trailing slashes, and neighboring `/ap/inbox/*` paths remain edge-rate-limited.

### Pre-cache Browser Limiting

Pre-cache identity rate limiting treats browser traffic as anonymous/generic because the edge cannot
check Valkey-backed session revocation. Authenticated trust-tier limits are enforced by backend
route rate limiting after authoritative auth resolution. Anonymous traffic uses the shared
`RATE_LIMITER_GET_HEAD` / `RATE_LIMITER_MUTATING` bindings under the `anon` key prefix.

Logic lives in [`src/identity-rate-limit.mts`](../../../../cloudflare-worker/src/identity-rate-limit.mts).

A web-target POST carrying `next-action` must pass both the generic mutating limiter and the
stricter Server Action limiter. API requests cannot opt into the Server Action namespace by
spoofing that header.

### Pre-cache Bindings

| Binding                      | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `RATE_LIMITER_GET_HEAD`      | GET/HEAD limiter for pre-cache browser traffic            |
| `RATE_LIMITER_MUTATING`      | Mutating limiter for pre-cache browser traffic            |
| `RATE_LIMITER_SERVER_ACTION` | Stricter mutating limiter for Next.js Server Action POSTs |

### Unknown Bot Rate Limiting

Unknown bot GET/HEAD requests skip the pre-cache limiter and run through the generic bindings under the `bot` key prefix
on cache misses and other non-cacheable or cache-bypassed paths, so cache hits are free. Unknown bot
mutating requests first run through the pre-cache anonymous/server-action limiter, then through the
post-cache bot limiter. This prevents a spoofed generic bot user agent from bypassing mutating rate
limits while preserving the existing bot IP bucket.
The exact `POST /ap/inbox` delivery route is the sole mutating exception because its authenticated
remote-host identity is available only at the backend; neighboring and wrong-method requests do
not inherit that exemption.

### Bot and Anonymous Keys

Bot and anonymous traffic share the generic `RATE_LIMITER_GET_HEAD` / `RATE_LIMITER_MUTATING`
bindings. Their buckets stay separate because the keys carry the `bot` and `anon` prefixes, so no
separate namespaces are needed.
