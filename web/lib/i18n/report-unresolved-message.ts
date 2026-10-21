import * as Sentry from '@sentry/nextjs'
import {
  createUnresolvedMessageReporter as createSharedUnresolvedMessageReporter,
  type UnresolvedMessageCapture,
} from '@vouchington/localization/react'

export function createUnresolvedMessageReporter(
  locale: string,
  captureException: UnresolvedMessageCapture = (error, context) => {
    Sentry.captureException(error, context)
  },
): (key: string) => string {
  return createSharedUnresolvedMessageReporter(locale, captureException)
}
