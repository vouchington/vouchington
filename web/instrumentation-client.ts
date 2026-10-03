import * as Sentry from '@sentry/nextjs'
import { disableSentryClient, startConsentGatedSentryClient } from './sentry-client-consent'

startConsentGatedSentryClient({
  init: options => Sentry.init(options),
  disable: () => disableSentryClient(Sentry.getClient()),
  close: () => Sentry.close(),
})

// The SDK exposes this hook through its browser conditional export.
// oxlint-disable-next-line import/namespace
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
