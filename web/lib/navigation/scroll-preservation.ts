interface PreservedScrollPosition {
  pathname: string
  scrollY: number
}

let preservedScrollPosition: PreservedScrollPosition | null = null

interface ScrollPreservingClickEvent {
  defaultPrevented: boolean
  button: number
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export function preserveScrollForPathname(pathname: string, scrollY = window.scrollY) {
  preservedScrollPosition = { pathname, scrollY }
}

export function consumePreservedScrollPosition(pathname: string): number | null {
  if (preservedScrollPosition === null) return null

  const preserved = preservedScrollPosition
  preservedScrollPosition = null
  return preserved.pathname === pathname ? preserved.scrollY : null
}

export function preserveScrollForInternalHrefClick(
  event: ScrollPreservingClickEvent,
  href: unknown,
): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    typeof href !== 'string'
  ) {
    return false
  }

  try {
    const url = new URL(href, window.location.href)
    if (url.origin !== window.location.origin) return false
    preserveScrollForPathname(url.pathname)
    return true
  } catch {
    // Ignore malformed hrefs; normal navigation handling can decide what to do.
    return false
  }
}
