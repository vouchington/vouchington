'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import {
  trackLandingPageClick,
  trackLandingPageVisit,
} from '@/lib/api/client/landing-page-analytics'

interface Props {
  landingPageId: string
  children: ReactNode
}

export function LandingPageTracker({ landingPageId, children }: Props) {
  const visitFiredRef = useRef(false)

  useEffect(() => {
    if (visitFiredRef.current) return
    visitFiredRef.current = true

    const params = new URLSearchParams(window.location.search)
    trackLandingPageVisit(landingPageId, {
      referrer: document.referrer || undefined,
      utm_source: params.get('utm_source') ?? params.get('ref') ?? undefined,
      utm_medium: params.get('utm_medium') ?? undefined,
      utm_campaign: params.get('utm_campaign') ?? undefined,
      utm_content: params.get('utm_content') ?? undefined,
    })
  }, [landingPageId])

  function fireClickBeacon(target: HTMLElement) {
    const anchor = target.closest('a[data-item-id]') as HTMLAnchorElement | null
    if (!anchor) return

    const itemId = anchor.dataset.itemId
    if (!itemId) return

    trackLandingPageClick(landingPageId, {
      landing_page_item_id: itemId,
      group_member_id: anchor.dataset.groupMemberId,
    })
  }

  function trackItemClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!(e.target instanceof HTMLElement)) return
    fireClickBeacon(e.target)
  }

  return (
    /* oxlint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- anchor elements inside handle keyboard events natively */
    /* ast-grep-ignore: web-clickable-needs-pointer -- display:contents wrapper, no box to show a cursor */
    <div
      onClick={trackItemClick}
      style={{ display: 'contents' }}
    >
      {children}
    </div>
    /* oxlint-enable jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */
  )
}
