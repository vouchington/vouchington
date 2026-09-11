import type * as Sentry from '@sentry/nextjs'
import { resolveSentryEnablement } from '@ts-shared/utils/sentry-deployment-gate'
import {
  scrubSentryError,
  scrubSentrySpan,
  scrubSentryTransaction,
} from '@/lib/on-error/scrub-sentry-event'
import {
  getBrowserRuntimePublicConfig,
  type RuntimePublicConfig,
} from '@/lib/runtime-public-config'

const dsn =
  'https://7a947dd8dc8d498c5b9d212113b1a44c@o4507688154824704.ingest.us.sentry.io/4507688156856320'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>

interface SentryClientInitDeps {
  getRuntimePublicConfig?: () => RuntimePublicConfig
  resolveSentryEnablement?: typeof resolveSentryEnablement
  scrubSentryError?: typeof scrubSentryError
  scrubSentrySpan?: typeof scrubSentrySpan
  scrubSentryTransaction?: typeof scrubSentryTransaction
}

export function createSentryClientInitOptions(deps: SentryClientInitDeps = {}): SentryInitOptions {
  const getRuntimeConfig = deps.getRuntimePublicConfig ?? getBrowserRuntimePublicConfig
  const resolveEnablement = deps.resolveSentryEnablement ?? resolveSentryEnablement
  const beforeSend = deps.scrubSentryError ?? scrubSentryError
  const beforeSendSpan = deps.scrubSentrySpan ?? scrubSentrySpan
  const beforeSendTransaction = deps.scrubSentryTransaction ?? scrubSentryTransaction
  // The browser has no OTel tracing story — OTEL_ENABLED never reaches the client bundle.
  const { enabled, environment } = resolveEnablement({
    environment: getRuntimeConfig().environment,
    otelEnabled: false,
  })

  return {
    dsn,

    // Route Sentry events through the CF Worker tunnel to bypass ad-blockers.
    // The CF Worker intercepts POST /monitoring and forwards to Sentry directly.
    tunnel: '/monitoring',

    // Set sample rate (1.0 = 100% for development, adjust for production)
    tracesSampleRate: 1,

    // Configure which URLs receive trace headers for distributed tracing.
    // Production API calls use relative URLs (same-origin through the CF Worker),
    // so Sentry attaches trace headers to them automatically — no production URLs needed here.
    tracePropagationTargets: ['localhost', /^http:\/\/localhost:2999/],

    // Environment detection
    environment: environment ?? 'development',

    release: process.env.NEXT_PUBLIC_GIT_COMMIT || undefined,

    enabled,

    // Enable debug mode in development
    debug: false,

    // Adjust these options for production
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,

    // Drop expected 4xx ApiError events — client errors are normal and not actionable.
    beforeSend,

    // Scrub request URLs and credentials from errors, transactions, and spans.
    beforeSendSpan,
    beforeSendTransaction,

    // Suppress common browser noise that is not actionable.
    ignoreErrors: [
      // Layout observers can fire during rapid resize; browser quirk, not a bug.
      /ResizeObserver loop/,
      // Next.js internal navigation signals (not real errors).
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
      // 401/403/404 ApiErrors serialized across the server-client boundary.
      /^NEXT_HTTP_ERROR_FALLBACK;(?:401|403|404)$/,
      // Other 4xx ApiErrors (400, 429, etc.) serialized across the boundary.
      // Matches both the legacy format and the status-bearing format EXPECTED_CLIENT_ERROR;{status}.
      /^EXPECTED_CLIENT_ERROR(?:;\d+)?$/,
      // Stale tabs loading old chunk URLs after a deployment.
      /Loading chunk [\d]+ failed/,
      /ChunkLoadError/,
      // Generic network errors from flaky connections or user offline.
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource',
      // User-initiated request cancellations.
      'AbortError',
    ],
  }
}
