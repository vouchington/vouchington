import * as Sentry from '@sentry/node'

if (process.env.OTEL_ENABLED === '1') {
  Sentry.preloadOpenTelemetry()
}
