import * as Sentry from '@sentry/nextjs'
import { startConsentGatedSentryClient } from './sentry-client-consent'

startConsentGatedSentryClient({
  init: options => Sentry.init(options),
  close: () => Sentry.close(),
})

// The SDK exposes this hook through its browser conditional export.
// oxlint-disable-next-line import/namespace
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
