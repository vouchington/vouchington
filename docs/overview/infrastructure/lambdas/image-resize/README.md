# Image Resize Lambda

Source entrypoint: [lambdas/image-resize/README.md](../../../../../lambdas/image-resize/README.md)

AWS Lambda that resizes and proxies images. CloudFront calls it through a Lambda Function URL;
there is no API Gateway.

```
Client → CloudFront → Lambda Function URL → Lambda → (cache|origin) S3 → Lambda → CloudFront → Client
```

## Development

- `pnpm run typecheck:lambdas` — typecheck Lambda workspaces
- `pnpm run test:lambdas` — run Lambda tests; append test paths to narrow the run
- `pnpm --filter @lambdas/image-resize run build` then `pnpm run test:smoke:image-lambda-package` — unzip
  the deployment package outside the repository and render an OG card through its bundled handler.
  Source tests resolve every runtime file from `node_modules`; only this check catches a file the zip
  omits. CI runs it on `linux-arm64`, where the packaged `sharp` binary loads; elsewhere it links the
  host's `sharp` binary.

The [placement smoke monitor](../../../../../monitors/lambdas/image-resize.mts) probes a random canonical
missing tuple and a removed generic image route through CloudFront; both must return exactly 404.
A configured `TEST_IMAGE_PLACEMENT_PATH` must name a current exact placement route (no query string)
with an allowed registry tuple and existing source; that optional probe requires 200 and `image/*`.
`LAMBDA_FUNCTION_URL` optionally verifies unsigned direct access returns exactly 403 using the same
canonical missing tuple. Lambda parsing rejects removed generic routes with 400; the edge denies
them with 404 before cache or origin lookup. These checks require the coordinated placement-only
edge contract, not a compatibility route. Run the monitor only against an authorized environment.

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

Source and rendered artifacts are streamed through private `os.tmpdir()` files. The handler returns
a buffered `APIGatewayProxyResult`, the shape a Function URL accepts in buffered mode, so it still
requires one final bounded read and base64 encoding at the response boundary; the raw-image cap accounts for base64 and proxy-envelope
expansion so the serialized response stays within Lambda's 6 MiB synchronous limit. Removing that
last copy requires the Function URL `RESPONSE_STREAM` deployment change in `vouchington-infra`.

`@vouchington/media` supplies bounded temporary-file and S3 object utilities, while
`@vouchington/image-resize` supplies format negotiation, MIME mapping, and the Sharp transform.
This Lambda owns routing, HMAC/SSRF enforcement, bucket selection, byte and pixel limits, cache
keys/headers, HTTP error mapping, and artifact cleanup. Adoption is output-compatible with the
existing transform. Placement-only route admission uses cache namespace `v3`.

## Request Envelope

### Source images

`GET /images/placements/<placement-id>/<revision>/<image-id>?w=<width>&h=<height>&q=<quality>&l=<0|1>&p=<0|1>&f=<jpeg|png|webp|avif>`

Every uploaded image uses this exact placement-bound form. Placement and image IDs must be canonical
lowercase UUIDs; revision is a canonical decimal integer from zero through 2147483647.
Generic `/images/<key>`, nested raw keys, and query-key fallback are rejected. The Lambda validates the
route binding and reads only `<image-id>` from S3. CloudFront authorization and its placement-state
registry remain infrastructure-owned; the Lambda route alone does not provide withholding.

- `image-id` — exact origin S3 UUID key, obtained only from the placement path
- `w` (required) / `h` (optional) — desired max dimensions; always maintains aspect ratio, never upscales
- `l` — lossless compression (`0`|`1`)
- `p` — progressive rendering (`0`|`1`)
- `q` — quality, clamped to environment's `qualities` list
- `f` — optional output format; when omitted, negotiated from `Accept`
- `Accept` header — participates in format negotiation (`Vary: Accept`)
- EXIF orientation is applied (`rotate()`) before resize so phone photos keep visual axes

### Sideloaded images

`GET /sideload/v2/<base64url>?w=<width>&h=<height>&q=<quality>&l=<0|1>&p=<0|1>&sig=<hmac>`

- `base64url` — original URL encoded with RFC 4648 §5 base64url (`-` not `+`, `_` not `/`)
- `sig` (required) — HMAC path signature from `@ts-shared/url-signing`; missing or invalid returns 403
- Same resize options as source images

#### SSRF Security

Private IPv4 ranges, loopback, link-local (including AWS metadata at `169.254.169.254`), IPv6 private ranges, legacy IPv4 literal encodings, and hostnames `localhost`/`metadata.google.internal` are blocked. First-party media hosts (`images.voucha.ai`, `images-staging.voucha.ai`, `IMAGE_ORIGIN`, and `MEDIA_SOURCE_HOST_ALIASES`, including subdomains) are rejected at signing and again before every fetch and redirect hop. Hostname sideloads validate DNS answers and fetch through the [`ssrf-guard`](https://www.npmjs.com/package/ssrf-guard) Node `safeFetch` helper so the actual request uses only validated public addresses. Redirects are followed one hop at a time with `maxRedirects: 0` so each target is authorized before the next pinned fetch. Removed `/sideload/` routes return 404 before any cache lookup.

### OG cards

`GET /og/<base64url>?sig=<hmac>`

- `base64url` — a JSON-encoded, base64url-encoded discriminated-union payload (mirrors `web/lib/seo/og-image-url.ts`):
  - `{ type: 'generic', eyebrow, title, description, domainLabel }`
  - `{ type: 'landing', displayName, username, topCategories: string[], dependencies }` — `dependencies` is a list of `{ placementId, revision, imageId }` tuples. Every dependency must authorize before any avatar byte is read. An unknown, withheld, or short result renders the letter placeholder and does not read S3. A raw `avatarImageId` is not a byte source.
  - both branches also carry a `rendererVersion` field (web's `OG_RENDERER_VERSION`) — a pure cache-buster the Lambda ignores; it only exists so a renderer change mints a fresh `/og/` URL instead of matching a stale immutable-cached PNG
- `sig` — HMAC signature over the **path only** (not the query string), via the same `@ts-shared/url-signing` helpers and signing keys as sideload; missing or invalid returns 403 under the same signing-required gate as sideload (`NODE_ENV=production` or `ENVIRONMENT` is `staging`/`production`)
- Renders a 1200×630 PNG with `satori` (flexbox layout → SVG) and `sharp` (SVG → PNG), using bundled `@fontsource/inter` `.woff` files
- `satori` shapes text with `harfbuzzjs`, which reads `hb.wasm` from the bundle's directory when it loads. `scripts/copy-og-assets.mts` copies it and the fonts into the zip; without `hb.wasm` every OG render fails
- Landing cards fetch an allowed dependency's image directly from the source bucket via `fetchImageFromS3` (no HTTP fetch — required for the IPv6-only egress flip) and normalize it to a 192×192 circle; a missing, oversize (50 MB / 24 MP), unauthorized, or unfetchable avatar falls back to an initial-letter avatar and never fails the request
- Bypasses the cache contract below entirely: OG responses are never written to the cache bucket and are re-rendered on every invocation. The `/og/<base64url>` path is already content-addressed, so CloudFront's own edge cache (not this Lambda's S3 render cache) is what makes repeat requests cheap. `CACHE_VERSION` does not apply to this route — instead, bump `OG_RENDERER_VERSION` in `web/lib/seo/og-image-url.ts` whenever the renderer output changes (see issue #8046), which mints new `/og/` paths and lets old immutable-cached PNGs age out untouched.

## Cache Contract

- Source key: `${key}--w${width}-h${height}-l${lossless}-p${progressive}-q${quality}-f${format}-v${cacheVersion}`
- Sideload key: `transformed/sideload/v2/${sha256(url)}--w${width}-h${height}-l${lossless}-p${progressive}-q${quality}-f${format}-v${cacheVersion}`
- Stored with `Cache-Control: public, max-age=31536000, immutable`, `StorageClass = ONEZONE_IA`
- Cache hits read from S3; misses fan out through the resize pipeline. A cache `PutObject` failure is logged to Sentry and still returns the rendered image (HTTP 200).
- CloudFront cache and origin-request policies allowlist query strings (`w,h,q,l,p,f,sig` for `/images` and `/sideload`; `sig` only for `/og`). Extra params do not bust the edge cache. Gzip/brotli are off so `Accept-Encoding` is not in the cache key.

## Sentry Error Monitoring

- Package: `@sentry/aws-serverless` (via `@lambdas/shared`)
- DSN: set the public `SENTRY_DSN` environment value in deployed environments; missing or invalid
  configuration disables Sentry and emits a value-free warning
- Initialization: `index.mts` first imports `sentry-init.mts`, which calls `initSentry()` at module
  load. There is no `awslambda-auto` preload and no `wrapHandler`. esbuild bundles
  `@sentry/aws-serverless` into `index.mjs` and the zip installs only `sharp`, so a
  `NODE_OPTIONS="--import @sentry/aws-serverless/awslambda-auto"` preload would not resolve.
- Captured errors: only cache-write failures, through `captureException`. Other errors become HTTP
  error responses and are not reported.
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

- URL signing: [`ts-shared/url-signing/index.mts`](../../../../../ts-shared/url-signing/index.mts)
- Rust sideload helpers: [https://github.com/jonathanong/vurst](https://github.com/jonathanong/vurst) (`@jongleberry/vurst-markdown`, `@jongleberry/vurst-html`)
- Deployment and infrastructure: `vouchington/vouchington-infra`
