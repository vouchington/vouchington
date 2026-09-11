// Content Security Policy for web (Next.js) routes only.
//
// Backend routes are excluded — they serve API responses, not HTML pages.
//
// The worker forwards a per-request CSP to the web origin so Next.js can
// extract the nonce and attach it to its generated scripts. When a nonce is
// present, 'unsafe-inline' would be ignored by modern browsers, so inline
// scripts must receive the nonce instead of relying on a fallback.

import { parseBrowserUploadOrigins } from './csp-browser-upload-origins.mts'

const isVitest = (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE === 'test'

// Server-side GTM container (first-party domain).
const GTM_ORIGIN = 'https://g.voucha.ai'

// Cloudflare Turnstile CAPTCHA — loads a script and renders in an iframe.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

// Google reCAPTCHA Enterprise — loads enterprise.js from www.google.com,
// lazy-loads static helpers from gstatic.com, mints tokens via a connect-src
// POST to www.google.com, and may render a challenge iframe from www.google.com.
// Included unconditionally (origins are harmless when the feature is disabled).
const RECAPTCHA_SCRIPT_ORIGINS = ['https://www.google.com', 'https://www.gstatic.com']
const RECAPTCHA_CONNECT_ORIGIN = 'https://www.google.com'
const RECAPTCHA_FRAME_ORIGIN = 'https://www.google.com'

// OAuth provider SDKs loaded via useLoadScript (web/hooks/use-*-auth.ts).
// Included unconditionally so enabling an OAuth provider doesn't require a
// CSP change — the extra origins are harmless when the provider is disabled.
const OAUTH_SCRIPT_ORIGINS = [
  'https://connect.facebook.net',
  'https://accounts.google.com',
  'https://appleid.cdn-apple.com',
]

// Google One Tap (google.accounts.id.prompt) renders its consent UI in an
// iframe sourced from accounts.google.com. Included unconditionally alongside
// the script origin so Google OAuth can be enabled without a CSP change.
const GOOGLE_FRAME_ORIGIN = 'https://accounts.google.com'

// Video embed origins for the podcast/video feed feature.
// YouTube uses youtube-nocookie.com for privacy-respecting embeds.
// Vimeo uses player.vimeo.com for their embed player.
// PeerTube instances are arbitrary origins — they cannot be added statically
// and render as external links instead of iframes.
const VIDEO_EMBED_ORIGINS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com']

// Pinned Sentry ingest hostname (per SECURITY.md production checklist).
// The primary path uses the /monitoring tunnel (same-origin); this is a
// fallback for contexts that cannot reach the tunnel (service workers,
// prerendered pages).
const SENTRY_INGEST_ORIGIN = 'https://o4507688154824704.ingest.us.sentry.io'

// Facebook API origins for connect-src: graph.facebook.com for Graph API calls
// and www.facebook.com for impression pixel / analytics.
const FACEBOOK_API_ORIGINS = ['https://graph.facebook.com', 'https://www.facebook.com']

// HN Algolia search. The browser fetches related threads for a URL when the
// Hacker News discussions preference is on. CORS reflects the requesting
// Origin, so no Worker proxy is required.
const HN_ALGOLIA_ORIGIN = 'https://hn.algolia.com'

// CloudFront image-delivery origins. The web image URL builder mints
// `https://images{,-staging}.voucha.ai/images/<id>` URLs that resolve directly
// to CloudFront (DNS no longer routes through this worker). Both hosts are
// allowed unconditionally so staging and production behave identically.
const IMAGE_DELIVERY_ORIGINS = ['https://images-staging.voucha.ai', 'https://images.voucha.ai']

/** Route-scoped CSP for the inline GlideMQ UI, update stream, and Google Fonts. */
export const buildDashboardCsp = (): string =>
  [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ')

export type WebCspDirective =
  | 'script-src'
  | 'style-src'
  | 'img-src'
  | 'font-src'
  | 'frame-src'
  | 'connect-src'

export type RegisteredWebCspOrigin = {
  origin: string
  directives: readonly WebCspDirective[]
}

export const REGISTERED_WEB_CSP_ORIGINS: readonly RegisteredWebCspOrigin[] = [
  { origin: GTM_ORIGIN, directives: ['script-src', 'frame-src', 'connect-src'] },
  { origin: TURNSTILE_ORIGIN, directives: ['script-src', 'frame-src', 'connect-src'] },
  { origin: 'https://connect.facebook.net', directives: ['script-src', 'connect-src'] },
  { origin: 'https://accounts.google.com', directives: ['script-src', 'frame-src', 'connect-src'] },
  { origin: 'https://appleid.cdn-apple.com', directives: ['script-src', 'connect-src'] },
  { origin: 'https://www.google.com', directives: ['script-src', 'frame-src', 'connect-src'] },
  { origin: 'https://www.gstatic.com', directives: ['script-src'] },
  { origin: 'https://www.youtube-nocookie.com', directives: ['frame-src'] },
  { origin: 'https://player.vimeo.com', directives: ['frame-src'] },
  { origin: SENTRY_INGEST_ORIGIN, directives: ['connect-src'] },
  { origin: 'https://graph.facebook.com', directives: ['connect-src'] },
  { origin: 'https://www.facebook.com', directives: ['connect-src'] },
  { origin: HN_ALGOLIA_ORIGIN, directives: ['connect-src'] },
  { origin: 'https://images-staging.voucha.ai', directives: ['img-src'] },
  { origin: 'https://images.voucha.ai', directives: ['img-src'] },
]

/**
 * Normalize an asset origin from an env var to a safe URL origin string.
 * Trims whitespace, validates the protocol, and strips any path/query/hash so a
 * misconfigured value (trailing slash, semicolon, etc.) cannot alter the CSP.
 *
 * Accepts:
 * - `https://` origins (production — CloudFront CDN)
 * - `http://localhost:*` origins (local dev — Next.js serves assets directly)
 *
 * Returns an empty string if the value is absent, empty, or invalid.
 */
export const normalizeAssetOrigin = (raw?: string): string => {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') return url.origin
    // Allow http://localhost:<port> for local development where Next.js
    // serves static assets directly (matching production's CloudFront pattern).
    if (url.protocol === 'http:' && url.hostname === 'localhost') return url.origin
    return ''
  } catch {
    return ''
  }
}

/**
 * Build the Content-Security-Policy header value for web routes.
 *
 * @param assetOrigin - Optional origin for static assets. In production, set
 *   to the CloudFront CDN origin (e.g. `https://d1234567.cloudfront.net`). In
 *   local dev, set to the Next.js dev server origin (e.g.
 *   `http://localhost:3000`). When set, the origin is added to script-src,
 *   style-src, img-src, font-src, and connect-src so the browser can load
 *   Next.js static assets from the separate origin. Omit or pass empty string
 *   when assets are served from the same origin.
 */
export const buildWebCsp = (
  assetOrigin: string | undefined,
  options: {
    browserUploadOrigins: string | undefined
    production?: boolean
    nonce: string
    requireBrowserUploadOrigins?: boolean
  },
): string => {
  const normalizedOrigin = normalizeAssetOrigin(assetOrigin)
  const browserUploadOrigins =
    options.requireBrowserUploadOrigins === false || (!options.browserUploadOrigins && isVitest)
      ? []
      : parseBrowserUploadOrigins(options.browserUploadOrigins)
  const asset = normalizedOrigin ? ` ${normalizedOrigin}` : ''
  // React dev mode requires 'unsafe-eval' for source maps and hot-reload error
  // callstacks. Excluded unless production is explicitly false, so callers
  // get the production-safe default when they omit the production flag.
  const devEval = options.production === false ? " 'unsafe-eval'" : ''
  // Non-production environments (local dev and staging) allow arbitrary http:
  // origins in img-src. Local dev mints http://localhost:<port>/images/... URLs
  // that hit the image-resize Lambda directly; staging uses PRODUCTION=false in
  // the private deployment manifest and also picks up this allowance. Not a concern for either
  // environment — restrict only matters in production.
  const devImg = options.production === false ? ' http:' : ''
  const nonce = ` 'nonce-${options.nonce}'`

  return [
    "default-src 'self'",
    `script-src 'self'${nonce} 'inline-speculation-rules'${devEval} ${GTM_ORIGIN} ${TURNSTILE_ORIGIN} ${OAUTH_SCRIPT_ORIGINS.join(' ')} ${RECAPTCHA_SCRIPT_ORIGINS.join(' ')}${asset}`,
    `style-src 'self' 'unsafe-inline'${asset}`,
    `img-src 'self' data: https:${devImg} ${IMAGE_DELIVERY_ORIGINS.join(' ')}${asset}`,
    `font-src 'self'${asset}`,
    `frame-src 'self' ${GTM_ORIGIN} ${TURNSTILE_ORIGIN} ${GOOGLE_FRAME_ORIGIN} ${RECAPTCHA_FRAME_ORIGIN} ${VIDEO_EMBED_ORIGINS.join(' ')}`,
    `media-src 'self' https: blob:`,
    // Asset origin supports source maps and dev overlay resources.
    `connect-src 'self' ${SENTRY_INGEST_ORIGIN} ${GTM_ORIGIN} ${TURNSTILE_ORIGIN} ${OAUTH_SCRIPT_ORIGINS.join(' ')} ${RECAPTCHA_CONNECT_ORIGIN} ${FACEBOOK_API_ORIGINS.join(' ')} ${HN_ALGOLIA_ORIGIN} ${browserUploadOrigins.join(' ')}${asset}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ')
}
