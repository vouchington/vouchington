import type * as Sentry from '@sentry/nextjs'
import { resolveSentryEnablement } from '@ts-shared/utils/sentry-deployment-gate'
import {
  scrubSentryError,
  scrubSentrySpan,
  scrubSentryTransaction,
} from '@/lib/on-error/scrub-sentry-event'

const dsn =
  'https://7a947dd8dc8d498c5b9d212113b1a44c@o4507688154824704.ingest.us.sentry.io/4507688156856320'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>

interface SentryEdgeInitDeps {
  resolveSentryEnablement?: typeof resolveSentryEnablement
  scrubSentryError?: typeof scrubSentryError
  scrubSentrySpan?: typeof scrubSentrySpan
  scrubSentryTransaction?: typeof scrubSentryTransaction
}

export function createSentryEdgeInitOptions(
  envVars: NodeJS.ProcessEnv = process.env,
  deps: SentryEdgeInitDeps = {},
): SentryInitOptions {
  const env = envVars.NODE_ENV || 'development'
  const resolveEnablement = deps.resolveSentryEnablement ?? resolveSentryEnablement
  const beforeSend = deps.scrubSentryError ?? scrubSentryError
  const beforeSendSpan = deps.scrubSentrySpan ?? scrubSentrySpan
  const beforeSendTransaction = deps.scrubSentryTransaction ?? scrubSentryTransaction
  const { enabled, environment, otelOnly } = resolveEnablement({
    environment: envVars.ENVIRONMENT,
    otelEnabled: envVars.OTEL_ENABLED === '1',
  })

  return {
    dsn: otelOnly ? undefined : dsn,

    // Set sample rate (1.0 = 100% for development, adjust for production)
    tracesSampleRate: 1,

    // Environment detection
    environment: environment ?? env,

    release: envVars.NEXT_PUBLIC_GIT_COMMIT || envVars.GIT_COMMIT || undefined,

    enabled,

    // Enable debug mode in development
    debug: false,

    // Drop expected 4xx ApiError events — client errors are normal and not actionable.
    beforeSend: otelOnly ? () => null : beforeSend,

    // Scrub request URLs and credentials from errors, transactions, and spans.
    beforeSendSpan,
    beforeSendTransaction,
  }
}
