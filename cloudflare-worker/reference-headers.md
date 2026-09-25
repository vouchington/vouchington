# Headers

[Back to Cloudflare Worker](README.md#headers)

### Request headers forwarded to origins

| Header                  | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `x-cf-worker-secret`    | Shared secret for backend origin verification (backend only)     |
| `x-request-id`          | UUID generated per request for distributed tracing               |
| `x-forwarded-host`      | Original client host                                             |
| `x-forwarded-proto`     | Original client protocol                                         |
| `x-forwarded-for`       | Client IP stamped by the Worker from `cf-connecting-ip`          |
| `x-voucha-gpc`          | Internal GPC marker set to `1` only when `Sec-GPC: 1` is present |
| `x-voucha-request-kind` | Trusted `bot` or `cache-fill` backend exemption marker           |

Browser-shaped backend requests are stamped with the canonical web client family, platform, and
edge release. Native Swift/.NET metadata is preserved. Bot and synthetic cache-fill requests get a
trusted request-kind marker instead, and never receive a fabricated device or client identity.
Client-supplied request-kind values are always stripped before the worker adds its trusted value.

The worker strips client-supplied `x-voucha-gpc` before forwarding requests, then sets it from
`Sec-GPC: 1`. Origins may also read the original `Sec-GPC` header, but should treat only exact
`1` values as active.

The Worker consumes incoming `CF-Connecting-IP` to stamp `X-Forwarded-For`, then defensively
removes the original header before origin fetches. Same-zone Cloudflare subrequests may regenerate
`CF-Connecting-IP` after that fetch boundary, so the backend origin guard verifies Worker
provenance and trusts Worker-stamped `X-Forwarded-For` first. The Worker sanitizes client-supplied
forwarding, rewrite, and method-override metadata before proxying. `X-Forwarded-Host`,
`X-Forwarded-Proto`, and `X-Forwarded-For` are overwritten with the Worker-trusted values listed
above. The remaining headers are removed entirely so origins never see client-controlled proxy
metadata or spoofed methods:

| Header                   |
| ------------------------ |
| `Forwarded`              |
| `True-Client-IP`         |
| `Via`                    |
| `X-Forwarded-Port`       |
| `X-Forwarded-Prefix`     |
| `X-Forwarded-Scheme`     |
| `X-Forwarded-Server`     |
| `X-Forwarded-Ssl`        |
| `X-Forwarded-Uri`        |
| `X-HTTP-Method`          |
| `X-HTTP-Method-Override` |
| `X-Method-Override`      |
| `X-Original-Url`         |
| `X-Real-IP`              |
| `X-Rewrite-Url`          |

### Response headers added by the worker

| Header                    | Purpose                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy` | Browser policy for web routes, applied after cache lookup                                                      |
| `x-voucha-cache`          | `DISPATCHED` (sent to `CachedOrigin`) or `BYPASS` — the gateway can't observe a platform cache HIT/MISS itself |
| `x-request-id`            | Echoes the request ID for client-side correlation                                                              |
| `server-timing`           | `origin;dur=N` — origin fetch latency in milliseconds                                                          |
| `Link`                    | Advertises public unauthenticated discovery resources                                                          |
| `Referrer-Policy`         | Defaults to `strict-origin-when-cross-origin`; preserves origin `no-referrer` on credential-bearing routes     |

`Content-Security-Policy` is added by the edge after cache lookup for web routes. Shared cache
entries strip origin `Content-Security-Policy` and `Content-Security-Policy-Report-Only` headers so
a nonce-bearing policy from one request cannot be replayed from cache on another request.

The edge preserves the origin's exact `Referrer-Policy: no-referrer` value on OAuth broker
callbacks and keyed RSS requests. This keeps callback codes, OAuth state, and RSS API keys out of
subsequent `Referer` headers without trusting arbitrary origin policies or unrelated routes.

`Link` discovery headers must advertise only public unauthenticated resources. `/llms.txt` and
`/.well-known/api-catalog` may also name the exact authenticated agent interfaces listed in
[Agent Access](../docs/requirements/platform/agent-access.md). Do not include any other
authenticated/private routes, internal URLs, or RSS `apikey` query strings.
