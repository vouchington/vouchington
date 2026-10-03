'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useLoadScript } from '@/hooks/use-load-script'
import { hasAnalyticsConsent, subscribeToCookieConsent } from '@/lib/privacy/cookie-consent'
import { getValidGtmId } from './gtm-id'
import { GTM_ORIGIN } from './gtm-origin'
import { GtmPageViewTracker } from './gtm-page-view-tracker'

// Loads GTM only after the user has granted cookie consent.
// Reads localStorage on mount and listens for cookie-consent-changed events.
export function GtmConsentLoader({ gtmId, nonce }: { gtmId?: string; nonce?: string }) {
  const validGtmId = getValidGtmId(gtmId)
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      validGtmId ? subscribeToCookieConsent(onStoreChange) : () => undefined,
    [validGtmId],
  )
  const getSnapshot = useCallback(() => !!validGtmId && hasAnalyticsConsent(), [validGtmId])
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
