import { hasNavigatorGlobalPrivacyControl } from './global-privacy-control'

export const COOKIE_CONSENT_STORAGE_KEY = 'cookie-consent'
export const COOKIE_CONSENT_CHANGED_EVENT = 'cookie-consent-changed'
export type CookieConsent = 'all' | 'essential'

export function readCookieConsent(): CookieConsent | null {
  try {
    const value = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
    return value === 'all' || value === 'essential' ? value : null
  } catch {
    return null
  }
}

export function writeCookieConsent(value: CookieConsent): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value)
  } catch {
    // Browser storage may be unavailable or full.
  }
}

export function hasAnalyticsConsent(): boolean {
  return readCookieConsent() === 'all' && !hasNavigatorGlobalPrivacyControl()
}

export function subscribeToCookieConsent(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COOKIE_CONSENT_STORAGE_KEY && event.key !== null) return
    try {
      if (event.storageArea !== localStorage) return
    } catch {
      // Reconcile to fail closed when browser storage becomes unavailable.
    }
    listener()
  }
  window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}
