# CF Worker (edge — all responses)

[Back to Security Architecture reference](reference-security-response-headers.md)

Applied by `cloudflare-worker/src/security-headers.mts` to every response before it reaches the client.
Cloudflare Worker production mode is parsed by `cloudflare-worker/src/production-mode.mts`: explicit
`PRODUCTION=false` and an unset value are non-production, while any other non-empty value fails closed
to production mode and keeps production-only security controls enabled.

| Header                         | Value                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `X-Content-Type-Options`       | `nosniff`                                                                                         |
| `X-Frame-Options`              | `SAMEORIGIN` (edge is authoritative)                                                              |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains` (production only; add `; preload` when `HSTS_PRELOAD=true`) |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`                                                                 |
| `Permissions-Policy`           | Denies unused browser capabilities (sensors, hardware APIs, tracking) to reduce attack surface.   |
| `Origin-Agent-Cluster`         | `?1`                                                                                              |
| `Cross-Origin-Opener-Policy`   | `same-origin-allow-popups`; OAuth callback documents use `unsafe-none`                            |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                     |
| `X-XSS-Protection`             | `0` (set by edge; backend also emits as defence-in-depth)                                         |

> **Note** (`Origin-Agent-Cluster: ?1`): Requests browser isolation by origin instead of allowing same-site subdomains to share a JavaScript agent cluster via `document.domain`. Browsers apply this per browsing context group, so existing tabs or windows that loaded the origin before the header keep their prior keying until users open a new browsing context. Do not add `document.domain`-based integrations; use explicit `postMessage` handoffs with origin validation instead.

> **Note** (`Cross-Origin-Opener-Policy: same-origin-allow-popups`): Isolates the top-level page
> from unrelated cross-origin openers while preserving the opener reference required when an OAuth
> popup returns to Voucha. The callback response uses `unsafe-none`; Chromium otherwise switches
> browsing-context groups when the provider navigates back and clears `window.opener`. OAuth
> handoffs must continue to validate origin, source window, provider, and state before accepting a
> result.

> **Note** (`Cross-Origin-Resource-Policy: same-origin`): Prevents any cross-origin JavaScript from reading these resources via `fetch`, XHR, or canvas. This applies to all routes including public-facing pages and API endpoints. If a public API endpoint or native/mobile client on a different origin needs cross-origin access, `security-headers.mts` must be updated to set `same-site` or `cross-origin` for that specific route.
