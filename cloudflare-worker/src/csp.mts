// Voucha owns the web route's allowed origins and upload-host policy. The published edge
// builder owns CSP serialization and safe default directives.
import { buildCsp, parseOriginAllowlist } from '@vouchington/edge'
import { getSentryDsnConfig } from '@ts-shared/utils/sentry-deployment-gate'

const isVitest = (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE === 'test'
const S3_ORIGIN_HOST = /^[a-z0-9][a-z0-9.-]*\.s3(?:\.dualstack)?\.[a-z0-9-]+\.amazonaws\.com$/u

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
  { origin: 'https://g.voucha.ai', directives: ['script-src', 'frame-src', 'connect-src'] },
  {
    origin: 'https://challenges.cloudflare.com',
    directives: ['script-src', 'frame-src', 'connect-src'],
  },
  { origin: 'https://connect.facebook.net', directives: ['script-src', 'connect-src'] },
  { origin: 'https://accounts.google.com', directives: ['script-src', 'frame-src', 'connect-src'] },
  { origin: 'https://appleid.cdn-apple.com', directives: ['script-src', 'connect-src'] },
  { origin: 'https://www.google.com', directives: ['script-src', 'frame-src', 'connect-src'] },
  { origin: 'https://www.gstatic.com', directives: ['script-src'] },
  { origin: 'https://www.youtube-nocookie.com', directives: ['frame-src'] },
  { origin: 'https://player.vimeo.com', directives: ['frame-src'] },
  { origin: 'https://graph.facebook.com', directives: ['connect-src'] },
  { origin: 'https://www.facebook.com', directives: ['connect-src'] },
  { origin: 'https://hn.algolia.com', directives: ['connect-src'] },
  { origin: 'https://images-staging.voucha.ai', directives: ['img-src'] },
  { origin: 'https://images.voucha.ai', directives: ['img-src'] },
]

/** Build the web CSP from the app's explicit origin registry and deployment settings. */
export function buildWebCsp(
  assetOrigin: string | undefined,
  options: {
    browserUploadOrigins: string | undefined
    production?: boolean
    nonce: string
    requireBrowserUploadOrigins?: boolean
    sentryTunnelPreviousWebDsn?: string
    sentryWebDsn?: string
  },
): string {
  const uploadOrigins =
    options.requireBrowserUploadOrigins === false || (!options.browserUploadOrigins && isVitest)
      ? []
      : parseOriginAllowlist(options.browserUploadOrigins, {
          isAllowedHostname: hostname => S3_ORIGIN_HOST.test(hostname),
          label: 'CSP_BROWSER_UPLOAD_ORIGINS',
        })
  const webDsn = getSentryDsnConfig(options.sentryWebDsn)
  const sentryOrigins = [
    webDsn?.origin,
    webDsn ? getSentryDsnConfig(options.sentryTunnelPreviousWebDsn)?.origin : undefined,
  ].filter((origin): origin is string => origin !== undefined)
  const originsFor = (directive: WebCspDirective): string[] => {
    const origins: string[] = []
    for (const entry of REGISTERED_WEB_CSP_ORIGINS)
      if (entry.directives.includes(directive)) origins.push(entry.origin)
    return origins
  }

  return buildCsp({
    nonce: options.nonce,
    production: options.production,
    assetOrigin,
    sources: {
      'script-src': ["'inline-speculation-rules'", ...originsFor('script-src')],
      'img-src': originsFor('img-src'),
      'frame-src': originsFor('frame-src'),
      'connect-src': [...sentryOrigins, ...originsFor('connect-src'), ...uploadOrigins],
    },
  })
}
