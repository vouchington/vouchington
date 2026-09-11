import type { CachePurgeResult } from 'cloudflare:workers'
import type { R2Bucket } from '@cloudflare/workers-types/index.ts'
import type { UiLocale } from '@ts-shared/languages/ui-locales'
import type { CacheAudience } from './cache-policy.mts'

interface RateLimiterBinding {
  limit: (options: { key: string }) => Promise<{ success: boolean }> | { success: boolean }
}

/**
 * `ctx.props` shape for the `CachedOrigin` WorkerEntrypoint (Workers Cache GA).
 * Cloudflare's Workers Cache keys a cached response by entrypoint, request
 * path/query, and this props object — so `audience`/`isRsc`/`lang` fully
 * replace the old query-param-based cache-key partitioning (`__aud=`/`__rsc=1`).
 */
export interface CachedOriginProps {
  audience: CacheAudience
  isRsc: boolean
  /**
   * UI locale partition (see edge-ui-locale.mts, #6994). Anon-audience only —
   * static/bot responses don't vary by it — and omitted whenever it resolves
   * to DEFAULT_UI_LOCALE so the cache key gains no extra fan-out until a
   * second UI locale ships.
   */
  lang?: UiLocale
}

export interface EdgeExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void
  /**
   * Cross-entrypoint RPC binding for the Workers Cache platform (see
   * `wrangler.local.jsonc` locally and the private deployment manifest in deployed environments). The gateway dispatches
   * cacheable requests here instead of fetching origin directly; the
   * platform cache sits in front of this call and short-circuits it on a
   * HIT, so `CachedOrigin.fetch` only actually runs on a MISS.
   */
  exports: {
    CachedOrigin: {
      fetch: (request: Request, init: { props: CachedOriginProps }) => Promise<Response>
      /**
       * RPC purge entry point (see cached-origin.mts's purge() method). Called by the
       * /infra/cache-purge route (cache-purge-route.mts) to invalidate cached entries by
       * Cache-Tag — see plan.md's Cache-Tag section.
       */
      purge: (tags: string[]) => Promise<CachePurgeResult>
    }
  }
}

export interface Env {
  CACHE_DIAGNOSTICS?: string
  SITEMAPS_ORIGIN?: string
  BACKEND_ORIGIN?: string
  WEB_ORIGIN?: string
  /** Set to 'true' only in local .dev.vars to proxy Next.js HMR WebSockets to a localhost WEB_ORIGIN. Ignored in production and non-local origins. */
  DEV_WEBSOCKET_PROXY?: string
  VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64?: string
  /** Public keys for edge-minted anonymous sessions. Used only for anonymous session reuse at the edge. */
  VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64?: string
  /** Set as a Cloudflare Worker secret to enable edge-side anonymous session minting. Never use backend authenticated-session signing keys here. */
  VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64?: string
  /**
   * Set to 'true' (case-insensitive) in production to enforce strict auth and HSTS headers.
   * Any non-empty value other than 'false' fails closed to production mode.
   */
  PRODUCTION?: string
  /**
   * Deployed-environment label for the shared fail-closed Sentry gate
   * (`resolveSentryEnablement`). Set to 'staging' or 'production' per environment;
   * unset in local dev, CI, and tests, which keeps Sentry disabled there.
   */
  ENVIRONMENT?: string
  /**
   * Set to 'true' (case-insensitive) to include the `preload` directive in the HSTS header.
   * Requires PRODUCTION=true. Opt-in is separate because preload list submission is
   * effectively irreversible — see production checklist in SECURITY.md.
   */
  HSTS_PRELOAD?: string
  CF_WORKER_SECRET?: string
  /**
   * Fixed per-deploy high-entropy placeholder nonce. CachedOrigin stamps this into cached
   * HTML/CSP in place of a real per-request nonce; the gateway rewrites it to a fresh nonce
   * on every serve (see nonce-rewrite.mts). Rotated only at deploy time, never per-request —
   * injected by the private deployment receiver. Its secrecy is
   * load-bearing: never log it.
   */
  CACHE_PLACEHOLDER_NONCE?: string
  SITEMAP_CACHE_TTL_SECONDS?: string
  STATIC_CACHE_TTL_SECONDS?: string
  BOT_CACHE_TTL_SECONDS?: string
  ANON_CACHE_TTL_SECONDS?: string
  RSS_CACHE_TTL_SECONDS?: string
  CACHED_STATIC_PATHS?: string
  SITE_ORIGIN?: string
  RATE_LIMITER_GET_HEAD?: RateLimiterBinding
  RATE_LIMITER_MUTATING?: RateLimiterBinding
  /** Post-cache rate limiter for unknown bots (GET/HEAD). Falls back to RATE_LIMITER_GET_HEAD if unset. */
  RATE_LIMITER_BOT_GET_HEAD?: RateLimiterBinding
  /** Post-cache rate limiter for unknown bots (mutating methods). Falls back to RATE_LIMITER_MUTATING if unset. */
  RATE_LIMITER_BOT_MUTATING?: RateLimiterBinding
  /** Pre-cache anonymous/generic rate limiters. Backend route limits handle authenticated trust tiers. */
  RATE_LIMITER_ANON_GET_HEAD?: RateLimiterBinding
  RATE_LIMITER_ANON_MUTATING?: RateLimiterBinding
  /**
   * Pre-cache limiter for Server Action POSTs (requests carrying `next-action` header).
   * Stricter bucket containing blast radius of any future RSC deserialize-DoS / RCE bug
   * (see CVE-2025-55184, CVE-2025-67779, CVE-2025-66478 React2Shell). Falls back to
   * the mutating bucket if unset.
   */
  RATE_LIMITER_SERVER_ACTION?: RateLimiterBinding
  /**
   * CloudFront CDN origin for Next.js static assets (e.g. `https://d1234567.cloudfront.net`).
   * Added to the CSP script-src, style-src, img-src, and font-src directives so the browser
   * can load `/_next/static/` assets from the CDN. Leave empty for same-origin environments.
   */
  CSP_ASSET_ORIGIN?: string
  /** Infrastructure-injected JSON array of exact S3 HTTPS origins accepted for browser uploads. */
  CSP_BROWSER_UPLOAD_ORIGINS?: string
  /** Comma-separated ISO 3166-1 Alpha-2 country codes to block. Empty/unset disables blocking. */
  GEO_BLOCKED_COUNTRIES?: string
  /** Git commit SHA for Sentry release tracking. Set at deploy time (e.g. wrangler deploy --var GIT_COMMIT:$(git rev-parse HEAD)). */
  GIT_COMMIT?: string
  /** Set to 'true' to add X-Robots-Tag: noindex to every response. Use for staging. */
  NOINDEX?: string
  /**
   * Comma-separated `user:password` pairs enabling HTTP Basic Auth.
   * Empty/unset disables the staging gate but fails closed in required docs/Pages gates.
   * Multiple entries support credential rotation: add a new pair, deploy, then revoke
   * the retired pair on the next rotation. Set via `wrangler secret put` — never plaintext.
   * Constraint: usernames and passwords must not contain a comma character;
   * whitespace is significant rather than separator padding.
   */
  BASIC_AUTH_CREDENTIALS?: string
  /** Set to 'true' to serve a Worker-owned 503 maintenance response. */
  MAINTENANCE_MODE?: string
  /** Retry-After seconds for Worker-owned maintenance responses. Defaults to 300. */
  MAINTENANCE_RETRY_AFTER_SECONDS?: string
  /**
   * R2 bucket binding for the private-infrastructure-managed internal docs site. Its presence is the
   * signal `index.mts` uses to branch to `serveDocs()` instead of the gateway path —
   * absent in every other environment.
   */
  DOCS_BUCKET?: R2Bucket
}
