import { hasAnalyticsConsent, subscribeToCookieConsent } from '@/lib/privacy/cookie-consent'
import { initializeSentryClient, type SentryInitOptions } from './sentry-client-options'

type InitializeDeps = Parameters<typeof initializeSentryClient>[1]
type RuntimeTarget = Parameters<typeof initializeSentryClient>[2]

interface ConsentGatedSentryClientDeps {
  init: (options: SentryInitOptions) => void
  disable: () => void
  close: () => unknown
  hasConsent?: () => boolean
  subscribe?: (listener: () => void) => () => void
  initializeDeps?: InitializeDeps
  runtimeTarget?: RuntimeTarget
}

export function startConsentGatedSentryClient({
  init,
  disable,
  close,
  hasConsent = hasAnalyticsConsent,
  subscribe = subscribeToCookieConsent,
  initializeDeps,
  runtimeTarget,
}: ConsentGatedSentryClientDeps): () => void {
  let started = false
  let initialized = false
  let closed = false

  const reconcile = () => {
    if (!hasConsent()) {
      if (initialized && !closed) {
        closed = true
        disable()
        void close()
      }
      return
    }
    if (started) return
    started = true
    initializeSentryClient(
      options => {
        if (!hasConsent() || closed) return
        initialized = true
        init(options)
      },
      initializeDeps,
      runtimeTarget,
    )
  }

  const unsubscribe = subscribe(reconcile)
  reconcile()
  return unsubscribe
}

export function disableSentryClient(
  client: { getOptions: () => { enabled?: boolean } } | undefined,
): void {
  if (client) client.getOptions().enabled = false
}
