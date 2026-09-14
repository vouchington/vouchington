# Image Resize Lambda

AWS Lambda behind API Gateway (HTTP API) and CloudFront that resizes and proxies images.

```
Client → CloudFront → Lambda Function URL → Lambda → (cache|origin) S3 → Lambda → CloudFront → Client
```

## Development

- `pnpm run typecheck:lambdas` — typecheck Lambda workspaces
- `pnpm run test:lambdas` — run Lambda tests; append test paths to narrow the run

## Runtime Configuration

`index.mts` wires the Lambda with `{ source, sideload }` config. The deployment owned by
`vouchington/vouchington-infra` injects
`S3_BUCKET_IMAGES` and `S3_BUCKET_RENDERS`; startup fails when either value is absent. `CACHE_VERSION`
in `config.mts` must be bumped whenever resizing behavior changes.

- `s3_bucket_origin` — read-only originals bucket (source images only)
- `s3_bucket_cache` — rendered-object bucket written with `ONEZONE_IA` storage class
- `widths` — allowed output widths; picks nearest ≤ requested, never upscales, falls back to smallest
- `qualities` — allowed JPEG/WebP/AVIF quality presets; requests clamp to this list
- `maxHeight` — maximum rendered height for all images
- `MAX_INPUT_IMAGE_BYTES` — 50 MB compressed cap for origin S3 objects and sideload fetches (HTTP 413 on `/images/*` and `/sideload/*`; `/og/*` degrades to the placeholder avatar)
- `MAX_INPUT_PIXELS` — 24 MP decoded Sharp cap (HTTP 413 on the resize pipeline; `/og/*` degrades to the placeholder); sized for the 512 MB Lambda

Source and rendered artifacts are streamed through private `os.tmpdir()` files. The current API
Gateway `APIGatewayProxyResult` integration still requires one final bounded read and base64
encoding at the response boundary; the raw-image cap accounts for base64 and proxy-envelope
expansion so the serialized response stays within Lambda's 6 MiB synchronous limit. Removing that
last copy requires the Function URL `RESPONSE_STREAM` deployment change in `vouchington-infra`.

`@vouchington/media` supplies bounded temporary-file and S3 object utilities, while
`@vouchington/image-resize` supplies format negotiation, MIME mapping, and the Sharp transform.
This Lambda owns routing, HMAC/SSRF enforcement, bucket selection, byte and pixel limits, cache
keys/headers, HTTP error mapping, and artifact cleanup. Adoption is output-compatible with the
existing transform, so `CACHE_VERSION` remains `v2`.

## Request Envelope

### Source images

`GET /images/<key>?w=<width>&h=<height>&q=<quality>&l=<0|1>&p=<0|1>&f=<jpeg|png|webp|avif>`

- `key` — exact origin S3 object key (may contain slashes)
- `w` (required) / `h` (optional) — desired max dimensions; always maintains aspect ratio, never upscales
- `l` — lossless compression (`0`|`1`)
- `p` — progressive rendering (`0`|`1`)
- `q` — quality, clamped to environment's `qualities` list
- `f` — optional output format; when omitted, negotiated from `Accept`
- `Accept` header — participates in format negotiation (`Vary: Accept`)
- EXIF orientation is applied (`rotate()`) before resize so phone photos keep visual axes

### Sideloaded images

`GET /sideload/<base64url>?w=<width>&h=<height>&q=<quality>&l=<0|1>&p=<0|1>&sig=<hmac>`

- `base64url` — original URL encoded with RFC 4648 §5 base64url (`-` not `+`, `_` not `/`)
- `sig` (required) — HMAC path signature from `@ts-shared/url-signing`; missing or invalid returns 403
- Same resize options as source images

#### SSRF Security

Private IPv4 ranges, loopback, link-local (including AWS metadata at `169.254.169.254`), IPv6 private ranges, legacy IPv4 literal encodings, and hostnames `localhost`/`metadata.google.internal` are blocked. Hostname sideloads validate DNS answers and fetch through the [`ssrf-guard`](https://www.npmjs.com/package/ssrf-guard) Node `safeFetch` helper so the actual request uses only validated public addresses. Redirects are followed only after the target URL is revalidated.

### OG cards

`GET /og/<base64url>?sig=<hmac>`

- `base64url` — a JSON-encoded, base64url-encoded discriminated-union payload (mirrors `web/lib/seo/og-image-url.ts`):
  - `{ type: 'generic', eyebrow, title, description, domainLabel }`
  - `{ type: 'landing', displayName, username, topCategories: string[], avatarImageId? }` — `avatarImageId` is omitted entirely (not `null`) when the profile has no avatar
  - both branches also carry a `rendererVersion` field (web's `OG_RENDERER_VERSION`) — a pure cache-buster the Lambda ignores; it only exists so a renderer change mints a fresh `/og/` URL instead of matching a stale immutable-cached PNG
- `sig` — HMAC signature over the **path only** (not the query string), via the same `@ts-shared/url-signing` helpers and signing keys as sideload; missing or invalid returns 403 under the same signing-required gate as sideload (`NODE_ENV=production` or `ENVIRONMENT` is `staging`/`production`)
- Renders a 1200×630 PNG with `satori` (flexbox layout → SVG) and `sharp` (SVG → PNG), using bundled `@fontsource/inter` `.woff` files
- Landing cards fetch the avatar directly from the source bucket via `fetchImageFromS3` (no HTTP fetch — required for the IPv6-only egress flip) and normalize it to a 192×192 circle; a missing, oversize (50 MB / 24 MP), or unfetchable avatar falls back to an initial-letter avatar and never fails the request
- Bypasses the cache contract below entirely: OG responses are never written to the cache bucket and are re-rendered on every invocation. The `/og/<base64url>` path is already content-addressed, so CloudFront's own edge cache (not this Lambda's S3 render cache) is what makes repeat requests cheap. `CACHE_VERSION` does not apply to this route — instead, bump `OG_RENDERER_VERSION` in `web/lib/seo/og-image-url.ts` whenever the renderer output changes (see issue #8046), which mints new `/og/` paths and lets old immutable-cached PNGs age out untouched.

## Cache Contract

- Source key: `${key}--w${width}-h${height}-l${lossless}-p${progressive}-q${quality}-f${format}-v${cacheVersion}`
- Sideload key: `${sha256(url)}--w${width}-h${height}-l${lossless}-p${progressive}-q${quality}-f${format}-v${cacheVersion}`
- Stored with `Cache-Control: public, max-age=31536000, immutable`, `StorageClass = ONEZONE_IA`
- Cache hits read from S3; misses fan out through the resize pipeline. A cache `PutObject` failure is logged to Sentry and still returns the rendered image (HTTP 200).
- CloudFront cache and origin-request policies allowlist query strings (`w,h,q,l,p,f,sig` for `/images` and `/sideload`; `sig` only for `/og`). Extra params do not bust the edge cache. Gzip/brotli are off so `Accept-Encoding` is not in the cache key.

## Sentry Error Monitoring

- Package: `@sentry/aws-serverless` (via `@lambdas/shared`)
- DSN: set the public `SENTRY_DSN` environment value in deployed environments; missing or invalid
  configuration disables Sentry and emits a value-free warning
- Auto-instrumentation: set `NODE_OPTIONS="--import @sentry/aws-serverless/awslambda-auto"`
- Release tracking: set `GIT_COMMIT` env var at deploy time
- 4xx errors (`RequestParseError` 400, `S3OperationError` 404) are filtered via `beforeSend`

## Sideload Clients

| Client                     | Width  | Entry point                                                                      |
| -------------------------- | ------ | -------------------------------------------------------------------------------- |
| Markdown post body         | 1200px | `@jongleberry/vurst-markdown` → `rewrite_image_to_sideload`                      |
| RSS modal (sanitized HTML) | 1200px | `@jongleberry/vurst-html` → `sanitize_rss_html_sync`                             |
| RSS card thumbnails        | 400px  | `backend/services/rss-feed-items/sideload-thumbnails.mts` → `proxyThumbnailUrls` |

All clients sign URLs via `VOUCHA_SIDELOAD_SIGNING_KEYS`. In deployed environments the Lambda reads the SecureString named by `VOUCHA_SIDELOAD_SIGNING_KEYS_PARAMETER` at runtime. Unsigned requests are accepted only outside staging/production.

## Related

- URL signing: [`ts-shared/url-signing/index.mts`](../../ts-shared/url-signing/index.mts)
- Rust sideload helpers: [https://github.com/jonathanong/vurst](https://github.com/jonathanong/vurst) (`@jongleberry/vurst-markdown`, `@jongleberry/vurst-html`)
- Deployment and infrastructure: `vouchington/vouchington-infra`
