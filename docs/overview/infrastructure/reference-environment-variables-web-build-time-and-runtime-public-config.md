# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Web Build-Time And Runtime-Public Config

Minimize `ARG`/`ENV` in the web Dockerfile. Environment-specific browser config should be
runtime-public and serialized into the HTML bootstrap by the server layout, following the
`IMAGE_ORIGIN` pattern. Keep Docker build args only for values that affect `next build` output or
build tooling.

| Name                                         | Where                                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_GIT_COMMIT`                     | Build                                                     | Git revision used to tag runtime Sentry events and client request metadata                                                                                                                                                                                                                                                                                                                                                                         |
| `NEXT_PUBLIC_ASSET_PREFIX`                   | Build (staging/production CDN origin; local-dev override) | Asset URL prefix — CloudFront CDN in staging and production. The shared CI web test build leaves it unset so Playwright and web-integration browsers fetch `/_next/*` through the same-origin Cloudflare Worker, independent of per-job ports. `IMAGE_ORIGIN` remains runtime-only through the root layout bootstrap. HTTP local development can point directly at Next.js; HTTPS local development uses the Worker origin to avoid mixed content. |
| OAuth client IDs                             | Runtime public                                            | Public provider IDs for login SDKs and redirects                                                                                                                                                                                                                                                                                                                                                                                                   |
| Captcha site keys                            | Runtime public                                            | Turnstile and reCAPTCHA public site keys                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`            | Runtime public                                            | Browser push VAPID public key                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `NEXT_PUBLIC_GTM_ID`                         | Runtime public                                            | GTM container ID                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH` | Runtime public                                            | Browser-side feature flag override cookie length limit (default: `4096`)                                                                                                                                                                                                                                                                                                                                                                           |

Image URLs intentionally use runtime `IMAGE_ORIGIN` instead of a `NEXT_PUBLIC_IMAGE_ENV` build
argument so the same web image can deploy to staging and production. The web layout mirrors this
runtime value into an inline bootstrap script for client components; that serialized value must be
escaped for the HTML script context before it is assigned to `window.__IMAGE_ORIGIN__`.
Runtime-public browser config uses the same bootstrap path via
`window.__VOUCHA_PUBLIC_CONFIG__`, assembled by `web/lib/runtime-public-config-server.ts` in the
server layout and consumed by client hooks through `web/lib/runtime-public-config-context.tsx`.
The standalone root-error document cannot render that layout, so it loads the minimal Sentry
bootstrap from the uncached, same-origin response. The Cloudflare Worker owns the steady-state
response in `cloudflare-worker/src/runtime-sentry-config.mts`; the matching
`web/app/runtime-sentry-config.js/route.ts` fallback preserves either web-first or Worker-first
deployment order.
`NEXT_PUBLIC_NOINDEX` is also intentionally excluded from the Docker build args because the web
image is promoted between environments; baking a staging noindex flag into the image could de-index
production.
