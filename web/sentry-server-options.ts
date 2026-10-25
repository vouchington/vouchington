import type * as Sentry from '@sentry/nextjs'
import { createVouchaSentryInitOptions } from '@ts-shared/utils/sentry-init-options'
import { isExpectedApiError } from '@vouchington/api-client'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>

export function createSentryServerInitOptions(
  envVars: NodeJS.ProcessEnv = process.env,
): SentryInitOptions {
  return {
    ...createVouchaSentryInitOptions({
      dsn: envVars.SENTRY_DSN,
      environment: envVars.ENVIRONMENT,
      fallbackEnvironment: envVars.NODE_ENV || 'development',
      release: envVars.NEXT_PUBLIC_GIT_COMMIT || envVars.GIT_COMMIT,
      tracesSampleRate: 1,
      // Drop expected 4xx ApiError events: client errors are normal and not actionable.
      filter: { isExpected: isExpectedApiError },
    }),

    // Enable debug mode in development
    debug: false,

    // @sentry/nextjs registers its own global TracerProvider by default. With OTEL_ENABLED=1 the
    // server runs under the dev/otel-register.mts preload, which owns the provider and OTLP export.
    ...(envVars.OTEL_ENABLED === '1' && { enableOpenTelemetrySetup: false }),
  }
}
