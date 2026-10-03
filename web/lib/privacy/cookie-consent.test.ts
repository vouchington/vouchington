import { dispatchStorageEvent } from '@/test-helpers/storage-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  hasAnalyticsConsent,
  readCookieConsent,
  subscribeToCookieConsent,
  writeCookieConsent,
} from './cookie-consent'

describe('cookie consent', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([null, 'essential', 'invalid', 'all'])('checks stored choice %s', value => {
    if (value !== null) localStorage.setItem('cookie-consent', value)
    expect(hasAnalyticsConsent()).toBe(value === 'all')
    expect(readCookieConsent()).toBe(value === 'all' || value === 'essential' ? value : null)
  })
  it('honors GPC over stored consent', () => {
    writeCookieConsent('all')
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true })
    try {
      expect(hasAnalyticsConsent()).toBe(false)
    } finally {
      Reflect.deleteProperty(navigator, 'globalPrivacyControl')
    }
  })
  it('fails closed when storage throws and tolerates writes', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn<Storage['getItem']>(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn<Storage['setItem']>(() => {
        throw new Error('blocked')
      }),
    })
    expect(hasAnalyticsConsent()).toBe(false)
    expect(() => writeCookieConsent('all')).not.toThrow()
  })
  it('reconciles fail closed when storage access throws during a storage event', () => {
    const listener = vi.fn<() => void>()
    const unsubscribe = subscribeToCookieConsent(listener)
    const storage = localStorage
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    dispatchStorageEvent('cookie-consent', storage)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
  it('filters storage events and removes both subscriptions', () => {
    const listener = vi.fn<() => void>()
    const unsubscribe = subscribeToCookieConsent(listener)
    dispatchStorageEvent('other', localStorage)
    dispatchStorageEvent('cookie-consent', sessionStorage)
    expect(listener).not.toHaveBeenCalled()
    dispatchStorageEvent('cookie-consent', localStorage)
    dispatchStorageEvent(null, localStorage)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    dispatchStorageEvent('cookie-consent', localStorage)
    window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT))
    expect(listener).toHaveBeenCalledTimes(2)
  })
  it('subscribes and unsubscribes without dispatching during writes', () => {
    const listener = vi.fn<() => void>()
    const unsubscribe = subscribeToCookieConsent(listener)
    writeCookieConsent('all')
    expect(listener).not.toHaveBeenCalled()
    window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT))
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
