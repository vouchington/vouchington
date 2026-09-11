# Content Security Policy (CF Worker)

[Back to Security Architecture reference](reference-security-response-headers.md#content-security-policy-cf-worker)

Set by `cloudflare-worker/src/csp.mts` via `addSecurityHeaders()`. Web-targeted routes receive the
nonce policy below. Backend routes normally receive no CSP because they serve APIs, except the
HTML GlideMQ dashboard under `/admin/mq-dashboard`, which receives a route-scoped policy allowing
its current inline scripts/styles/event handlers, same-origin fetch/SSE, and Google Fonts. It keeps
`object-src 'none'` and `frame-ancestors 'self'`; these dashboard allowances must not be broadened
to other backend routes.

| Header                    | Value     |
| ------------------------- | --------- |
| `Content-Security-Policy` | See below |

```txt
default-src 'self';
script-src 'self' 'nonce-{per-request-nonce}' 'inline-speculation-rules' https://g.voucha.ai https://challenges.cloudflare.com https://connect.facebook.net https://accounts.google.com https://appleid.cdn-apple.com https://www.google.com https://www.gstatic.com {CSP_ASSET_ORIGIN};
style-src 'self' 'unsafe-inline' {CSP_ASSET_ORIGIN};
img-src 'self' data: https: https://images-staging.voucha.ai https://images.voucha.ai {CSP_ASSET_ORIGIN};
font-src 'self' {CSP_ASSET_ORIGIN};
frame-src 'self' https://g.voucha.ai https://challenges.cloudflare.com https://accounts.google.com https://www.google.com https://www.youtube-nocookie.com https://player.vimeo.com;
media-src 'self' https: blob:;
connect-src 'self' https://o4507688154824704.ingest.us.sentry.io https://g.voucha.ai https://challenges.cloudflare.com https://connect.facebook.net https://accounts.google.com https://appleid.cdn-apple.com https://www.google.com https://graph.facebook.com https://www.facebook.com {CSP_BROWSER_UPLOAD_ORIGINS} {CSP_ASSET_ORIGIN};
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'self'
```

`{CSP_ASSET_ORIGIN}` is the static asset origin (env var `CSP_ASSET_ORIGIN`). In local dev it is the Next.js server origin (for example, `http://localhost:3000`); in production set it to the CloudFront distribution URL. The CF Worker generates the script nonce per request, forwards it to the web origin in `x-nonce`, and applies the matching CSP after cache lookup. Shared cache entries strip CSP headers so nonce-bearing policies are never replayed from cache.

`{CSP_BROWSER_UPLOAD_ORIGINS}` is a private-infrastructure-injected JSON array of exact regional and
dual-stack S3 HTTPS origins. The Worker rejects missing, malformed, non-S3, path-bearing, and
duplicate values; no bucket identity is committed in application source.

> **Note**: `unsafe-inline` remains in `style-src` for framework/runtime styles. It is intentionally absent from `script-src` when the per-request nonce is present. `inline-speculation-rules` is present only so the anonymous root-layout `<script type="speculationrules">` can provide conservative same-origin prefetch rules; it does not allow general inline JavaScript.

Browser third-party origins must be listed in `REGISTERED_WEB_CSP_ORIGINS` in
`cloudflare-worker/src/csp.mts` with the directives they require. The worker CSP tests fail when an
explicit emitted origin is not registered or when a registered origin is missing from a required
directive.

---
