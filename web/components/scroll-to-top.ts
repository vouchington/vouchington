'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { consumePreservedScrollPosition } from '@/lib/navigation/scroll-preservation'

const DESKTOP_FOCUS_MEDIA_QUERY = '(min-width: 768px)'
const PRIMARY_ROUTE_FOCUS_SELECTOR = '[data-route-focus-target="primary"]:not([disabled])'

// Skip scroll-to-top for Back/Forward (popstate) navigations so the browser's
// native scroll restoration can restore the previous scroll position.
//
// We store the destination pathname at popstate time (window.location.pathname
// after the URL updates) rather than a boolean flag. This handles same-pathname
// Back/Forward navigations (e.g. filter-param history entries) correctly: the
// popstate fires and records the current pathname, but usePathname() doesn't
// change, so the pathname effect never runs and never consumes the flag. The
// stored pathname therefore does NOT match the next forward navigation's
// destination pathname, and scroll resets as expected.
export function ScrollToTop() {
  const pathname = usePathname()
  const prevPathnameRef = useRef<string | null>(null)
  const popstateDestinationRef = useRef<string | null>(null)

  useEffect(() => {
    function onPopstate() {
      popstateDestinationRef.current = window.location.pathname
    }
    window.addEventListener('popstate', onPopstate)
    return () => window.removeEventListener('popstate', onPopstate)
  }, [])

  useEffect(() => {
    const prev = prevPathnameRef.current
    prevPathnameRef.current = pathname
    if (prev === null) return
    if (prev === pathname) return
    const wasPopstate = popstateDestinationRef.current === pathname
    popstateDestinationRef.current = null
    if (wasPopstate) return
    const preservedScrollY = consumePreservedScrollPosition(pathname)
    if (preservedScrollY !== null) {
      return restorePreservedScrollWhenReachable(preservedScrollY)
    }
    if (window.location.hash !== '') return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    focusPrimaryRouteTarget()
  }, [pathname])

  return null
}

function restorePreservedScrollWhenReachable(scrollY: number) {
  let cleanedUp = false
  const observer = new ResizeObserver(restore)

  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    observer.disconnect()
    window.removeEventListener('scroll', cancelAfterUserScroll)
  }

  function cancelAfterUserScroll() {
    if (window.scrollY !== 0 && window.scrollY !== scrollY) cleanup()
  }

  function restore() {
    if (window.scrollY === scrollY) {
      cleanup()
      return
    }

    const maxScrollY =
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) -
      window.innerHeight
    if (maxScrollY < scrollY) return

    window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' })
    if (window.scrollY === scrollY) cleanup()
  }

  window.addEventListener('scroll', cancelAfterUserScroll, { passive: true })
  observer.observe(document.documentElement)
  observer.observe(document.body)
  restore()
  return cleanup
}

function focusPrimaryRouteTarget() {
  if (typeof window === 'undefined') return
  if (window.matchMedia && !window.matchMedia(DESKTOP_FOCUS_MEDIA_QUERY).matches) return
  window.setTimeout(() => {
    const target = document.querySelector<HTMLElement>(PRIMARY_ROUTE_FOCUS_SELECTOR)
    target?.focus({ preventScroll: true })
  }, 0)
}
