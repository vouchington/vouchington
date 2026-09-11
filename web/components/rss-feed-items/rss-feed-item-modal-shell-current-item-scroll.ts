import { useEffect, useRef } from 'react'

export function useScrollCurrentRssItemIntoView(currentItemId: string) {
  const hasMountedRef = useRef(false)

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    const elements = [
      ...document.querySelectorAll<HTMLElement>(`[data-rss-item-id="${currentItemId}"]`),
    ]
    if (elements.length === 0) return

    const viewportCenter = window.innerHeight / 2
    const el = elements.reduce((closest, candidate) => {
      const closestRect = closest.getBoundingClientRect()
      const candidateRect = candidate.getBoundingClientRect()
      const closestDist = Math.abs(closestRect.top + closestRect.height / 2 - viewportCenter)
      const candidateDist = Math.abs(candidateRect.top + candidateRect.height / 2 - viewportCenter)
      return candidateDist < closestDist ? candidate : closest
    })
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'
    el.scrollIntoView({ block: 'nearest', behavior })
  }, [currentItemId])
}
