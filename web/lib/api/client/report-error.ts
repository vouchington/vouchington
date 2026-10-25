import * as Sentry from '@sentry/nextjs'

/** Reports an unexpected API client failure to Sentry. */
export function reportClientError(error: unknown): void {
  Sentry.captureException(error)
}
