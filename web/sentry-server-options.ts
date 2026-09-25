import type * as Sentry from '@sentry/nextjs'
import {
  resolveSentryDsnEnablement,
  SENTRY_CONFIGURATION_WARNING,
} from '@ts-shared/utils/sentry-deployment-gate'
import { scrubSentryError, scrubSentrySpan } from '@/lib/on-error/scrub-sentry-event'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>

interface SentryServerInitDeps {
  scrubSentryError?: typeof scrubSentryError
  resolveSentryEnablement?: typeof resolveSentryDsnEnablement
  scrubSentrySpan?: typeof scrubSentrySpan
}

let sentryConfigurationInvalidLogged = false

function warnIfSentryConfigurationInvalid(configurationInvalid: boolean): void {
  if (configurationInvalid && !sentryConfigurationInvalidLogged) {
    console.warn(SENTRY_CONFIGURATION_WARNING)
    sentryConfigurationInvalidLogged = true
  }
}

export function createSentryServerInitOptions(
  envVars: NodeJS.ProcessEnv = process.env,
  deps: SentryServerInitDeps = {},
): SentryInitOptions {
  const env = envVars.NODE_ENV || 'development'
  const beforeSend = deps.scrubSentryError ?? scrubSentryError
  const beforeSendSpan = deps.scrubSentrySpan ?? scrubSentrySpan
  const resolveEnablement = deps.resolveSentryEnablement ?? resolveSentryDsnEnablement
  const otelEnabled = envVars.OTEL_ENABLED === '1'
  const { enabled, environment, otelOnly, sentryDsn, configurationInvalid } = resolveEnablement({
    dsn: envVars.SENTRY_DSN,
    environment: envVars.ENVIRONMENT,
    otelEnabled,
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

    // Scrub request URLs and credentials from errors and spans (request data rides on segment-span attributes).
    beforeSendSpan,

    // @sentry/nextjs registers its own global TracerProvider by default. With OTEL_ENABLED=1 the
    // server runs under the dev/otel-register.mts preload, which owns the provider and OTLP export.
    ...(otelEnabled && { enableOpenTelemetrySetup: false }),
  }
}
