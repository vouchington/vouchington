# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Cloudflare Worker

The local file supplies identifier-free development values. Private infrastructure supplies all
deployed variables and encrypted bindings:

| Name                                 | Notes                                                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64` | JWT public keys for session verification at edge                                                                                                                                          |
| `CF_WORKER_SECRET`                   | Shared secret passed to backend for request verification                                                                                                                                  |
| `BACKEND_ORIGIN`                     | Backend origin URL                                                                                                                                                                        |
| `WEB_ORIGIN`                         | Web origin URL                                                                                                                                                                            |
| `SITEMAPS_ORIGIN`                    | Private-infrastructure-owned sitemap proxy origin                                                                                                                                         |
| `CSP_BROWSER_UPLOAD_ORIGINS`         | Private-infrastructure-injected JSON array of exact regional and dual-stack S3 HTTPS upload origins                                                                                       |
| `SITE_ORIGIN`                        | Canonical site origin                                                                                                                                                                     |
| `PRODUCTION`                         | Set to `'true'` in production to enforce HSTS and CF Access; set to `'false'` outside production. Ambiguous non-empty values fail closed to production mode while logging a config error. |
| `HSTS_PRELOAD`                       | Set to `'true'` to include `preload` in HSTS (see SECURITY.md before enabling)                                                                                                            |
| `CSP_ASSET_ORIGIN`                   | Asset origin added to CSP — CloudFront CDN in production (e.g. `https://d123.cloudfront.net`), Next.js dev server in local dev (e.g. `http://localhost:3000`)                             |
| `GEO_BLOCKED_COUNTRIES`              | Comma-separated ISO 3166-1 country codes to block                                                                                                                                         |
| `SITEMAP_CACHE_TTL_SECONDS`          | Cache TTL for sitemap responses (default: 86400)                                                                                                                                          |
| `STATIC_CACHE_TTL_SECONDS`           | Cache TTL for static assets (default: 86400)                                                                                                                                              |
| `BOT_CACHE_TTL_SECONDS`              | Cache TTL for bot requests (default: 86400)                                                                                                                                               |
| `ANON_CACHE_TTL_SECONDS`             | Cache TTL for anonymous requests (default: 30)                                                                                                                                            |
| `RSS_CACHE_TTL_SECONDS`              | Cache TTL for RSS feeds (default: 300)                                                                                                                                                    |
| `CACHED_STATIC_PATHS`                | Additional path patterns to cache as static                                                                                                                                               |
| `CACHE_DIAGNOSTICS`                  | Set to `'true'` in staging to emit bounded structured cache diagnostics (request ID, route target, method class, status, and cache disposition only)                                      |
| `DEV_WEBSOCKET_PROXY`                | Set to `'true'` only in local `.dev.vars` to proxy `/_next/webpack-hmr` WebSockets to a localhost `WEB_ORIGIN`; production and non-local origins always reject WebSocket upgrades         |
| `NOINDEX`                            | Set to `'true'` to add `X-Robots-Tag: noindex` to every response; use for staging                                                                                                         |
| `RATE_LIMITER_GET_HEAD`              | Rate limiter binding for GET/HEAD requests                                                                                                                                                |
| `RATE_LIMITER_MUTATING`              | Rate limiter binding for mutating requests                                                                                                                                                |
| `RATE_LIMITER_SERVER_ACTION`         | Nested limiter for web POST requests carrying `next-action`; staging allows 30 requests per 60 seconds in addition to the general mutating quota                                          |

Private infrastructure declares the three staging rate-limit bindings at 600 GET/HEAD, 60
mutating, and 30 Server Action requests per 60 seconds. The deployment also requires
`CF_WORKER_SECRET`, `CACHE_PLACEHOLDER_NONCE`, `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64`, and
`BASIC_AUTH_CREDENTIALS` before deployment. Anonymous cache TTL remains 30 seconds until the live
staging checklist in #7306 passes; raising it to 300 seconds is a separate gated change.
The staging deployment workflow resynchronizes `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64` and
`CF_WORKER_SECRET` from their authoritative encrypted SSM parameters before validating the
Cloudflare upload, so backend key rotation cannot leave the edge stale. `BASIC_AUTH_CREDENTIALS`
remains an encrypted Cloudflare Worker secret managed through the dashboard or `wrangler secret
put`; deploys inherit it without copying the credential into GitHub Actions or SSM.

The private reference sites use a separate operator-held list with the same binding name. Its exact
value is copied interactively into the docs Worker, Pages production, and Pages preview encrypted
bindings. OpenTofu manages only the R2 bucket, Pages project, and `fail_open=false` configuration;
GitHub Actions preserves or consumes the bindings without receiving the credential value. See
[Private Internal Reference Sites](../../operations/private-docs-site.md).
