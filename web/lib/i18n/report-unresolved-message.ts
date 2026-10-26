import * as Sentry from '@sentry/nextjs'
import {
  createUnresolvedMessageReporter as createReporter,
  type UnresolvedMessageCapture,
} from '@vouchington/localization'

export function createUnresolvedMessageReporter(
  locale: string,
  captureException: UnresolvedMessageCapture = (error, context) => {
    Sentry.captureException(error, context)
  },
): (key: string) => string {
  return createReporter(locale, captureException)
}
