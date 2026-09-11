'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { pushEvent } from './data-layer'
import { getValidGtmId } from './gtm-id'

// Pushes a page_view event to the GTM dataLayer on each client-side route change.
// Returns null — no DOM output. When gtmId is absent, returns null immediately
// with zero side effects.
export function GtmPageViewTracker({ gtmId }: { gtmId?: string }) {
  const pathname = usePathname()
  const validGtmId = getValidGtmId(gtmId)

  useEffect(() => {
    if (!validGtmId) return
    pushEvent({ event: 'page_view', page_path: pathname })
  }, [pathname, validGtmId])

  return null
}
