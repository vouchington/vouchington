'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useLoadScript } from '@/hooks/use-load-script'
import { hasNavigatorGlobalPrivacyControl } from '@/lib/privacy/global-privacy-control'
import { getValidGtmId } from './gtm-id'
import { GTM_ORIGIN } from './gtm-origin'
import { GtmPageViewTracker } from './gtm-page-view-tracker'

function getConsent(): string | null {
  try {
    return localStorage.getItem('cookie-consent')
  } catch {
    return null
  }
}

function subscribeToConsent(onStoreChange: () => void) {
  window.addEventListener('cookie-consent-changed', onStoreChange)
  return () => window.removeEventListener('cookie-consent-changed', onStoreChange)
}

function getHasConsentSnapshot() {
  return getConsent() === 'all' && !hasNavigatorGlobalPrivacyControl()
}

// Loads GTM only after the user has granted cookie consent.
// Reads localStorage on mount and listens for cookie-consent-changed events.
export function GtmConsentLoader({ gtmId, nonce }: { gtmId?: string; nonce?: string }) {
  const validGtmId = getValidGtmId(gtmId)
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      validGtmId ? subscribeToConsent(onStoreChange) : () => undefined,
    [validGtmId],
  )
  const getSnapshot = useCallback(() => !!validGtmId && getHasConsentSnapshot(), [validGtmId])
  const hasConsent = useSyncExternalStore(subscribe, getSnapshot, () => false)

  // Initialize dataLayer when consent is granted
  useEffect(() => {
    if (!hasConsent || !validGtmId) return
    window.dataLayer ??= []
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  }, [hasConsent, validGtmId])

  const gtmSrc = hasConsent ? `${GTM_ORIGIN}/gtm.js?id=${validGtmId}` : ''
  useLoadScript(gtmSrc, { nonce })

  if (!hasConsent) return null

  return <GtmPageViewTracker gtmId={validGtmId} />
}
