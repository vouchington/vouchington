import type * as Sentry from '@sentry/nextjs'
import {
  resolveSentryDsnEnablement,
  SENTRY_CONFIGURATION_WARNING,
} from '@ts-shared/utils/sentry-deployment-gate'
import {
  scrubSentryError,
  scrubSentrySpan,
  scrubSentryTransaction,
} from '@/lib/on-error/scrub-sentry-event'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>

interface SentryEdgeInitDeps {
  resolveSentryEnablement?: typeof resolveSentryDsnEnablement
  scrubSentryError?: typeof scrubSentryError
  scrubSentrySpan?: typeof scrubSentrySpan
  scrubSentryTransaction?: typeof scrubSentryTransaction
}

let sentryConfigurationInvalidLogged = false

function warnIfSentryConfigurationInvalid(configurationInvalid: boolean): void {
  if (configurationInvalid && !sentryConfigurationInvalidLogged) {
    console.warn(SENTRY_CONFIGURATION_WARNING)
    sentryConfigurationInvalidLogged = true
  }
}

export function createSentryEdgeInitOptions(
  envVars: NodeJS.ProcessEnv = process.env,
  deps: SentryEdgeInitDeps = {},
): SentryInitOptions {
  const env = envVars.NODE_ENV || 'development'
  const resolveEnablement = deps.resolveSentryEnablement ?? resolveSentryDsnEnablement
  const beforeSend = deps.scrubSentryError ?? scrubSentryError
  const beforeSendSpan = deps.scrubSentrySpan ?? scrubSentrySpan
  const beforeSendTransaction = deps.scrubSentryTransaction ?? scrubSentryTransaction
  const { enabled, environment, otelOnly, sentryDsn, configurationInvalid } = resolveEnablement({
    dsn: envVars.SENTRY_DSN,
    environment: envVars.ENVIRONMENT,
    otelEnabled: envVars.OTEL_ENABLED === '1',
  })
  warnIfSentryConfigurationInvalid(configurationInvalid)

  return {
    dsn: otelOnly ? undefined : sentryDsn?.dsn,

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
