import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COOKIE_CONSENT_CHANGED_EVENT, writeCookieConsent } from './lib/privacy/cookie-consent'
import {
  RUNTIME_PUBLIC_CONFIG_READY_EVENT,
  type RuntimePublicConfig,
} from './lib/runtime-public-config'
import { startConsentGatedSentryClient } from './sentry-client-consent'
import type { SentryInitOptions } from './sentry-client-options'

const unsubscribes: Array<() => void> = []

function start(ready = true) {
  let config: RuntimePublicConfig | undefined = ready
    ? { environment: 'production', sentryDsn: 'https://public@example.test/123' }
    : undefined
  const target = new EventTarget()
  const init = vi.fn<(options: SentryInitOptions) => void>()
  const close = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
  unsubscribes.push(
    startConsentGatedSentryClient({
      init,
      close,
      initializeDeps: { getRuntimePublicConfig: () => config },
      runtimeTarget: target,
    }),
  )
  return {
    init,
    close,
    ready: () => {
      config = { environment: 'production', sentryDsn: 'https://public@example.test/123' }
      target.dispatchEvent(new Event(RUNTIME_PUBLIC_CONFIG_READY_EVENT))
    },
  }
}
function change(value: 'all' | 'essential') {
  writeCookieConsent(value)
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT))
}

describe('consent-gated Sentry lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    unsubscribes.splice(0).forEach(unsubscribe => unsubscribe())
    vi.restoreAllMocks()
  })

  it('initializes immediately with consent and ready config', () => {
    writeCookieConsent('all')
    expect(start().init).toHaveBeenCalledTimes(1)
  })
  it('initializes when consent arrives', () => {
    const client = start()
    expect(client.init).not.toHaveBeenCalled()
    change('all')
    expect(client.init).toHaveBeenCalledTimes(1)
  })
  it('does not initialize with essential consent', () => {
    writeCookieConsent('essential')
    expect(start().init).not.toHaveBeenCalled()
  })
  it('does not initialize with GPC', () => {
    writeCookieConsent('all')
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true })
    try {
      expect(start().init).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(navigator, 'globalPrivacyControl')
    }
  })
  it('rechecks withdrawal before runtime config arrives', () => {
    const client = start(false)
    change('all')
    change('essential')
    client.ready()
    expect(client.init).not.toHaveBeenCalled()
    expect(client.close).not.toHaveBeenCalled()
  })
  it('initializes once across repeated events', () => {
    const client = start()
    change('all')
    change('all')
    expect(client.init).toHaveBeenCalledTimes(1)
  })
  it('closes once after opt-out', () => {
    writeCookieConsent('all')
    const client = start()
    change('essential')
    change('essential')
    expect(client.close).toHaveBeenCalledTimes(1)
  })
  it('does not initialize again after close', () => {
    writeCookieConsent('all')
    const client = start()
    change('essential')
    change('all')
    expect(client.init).toHaveBeenCalledTimes(1)
    expect(client.close).toHaveBeenCalledTimes(1)
  })
})
