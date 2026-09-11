let preservedScrollPathname: string | null = null

interface ScrollPreservingClickEvent {
  defaultPrevented: boolean
  button: number
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export function preserveScrollForPathname(pathname: string) {
  preservedScrollPathname = pathname
}

export function consumePreservedScrollPathname(pathname: string): boolean {
  if (preservedScrollPathname === null) return false

  const shouldPreserve = preservedScrollPathname === pathname
  preservedScrollPathname = null
  return shouldPreserve
}

export function preserveScrollForInternalHrefClick(
  event: ScrollPreservingClickEvent,
  href: unknown,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    typeof href !== 'string'
  ) {
    return
  }

  try {
    const url = new URL(href, window.location.href)
    if (url.origin === window.location.origin) preserveScrollForPathname(url.pathname)
  } catch {
    // Ignore malformed hrefs; normal navigation handling can decide what to do.
  }
}
