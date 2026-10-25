'use client'

import { useEffect, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import { trackRssFeedItemView } from '@/lib/api/client/rss-feed-analytics'

interface Props {
  itemId: string
}

export function RssFeedItemViewTracker({ itemId }: Props) {
  const hasFired = useRef(false)

  useEffect(() => {
    if (hasFired.current) return
    hasFired.current = true
    trackRssFeedItemView(itemId).catch(Sentry.captureException)
  }, [itemId])

  return null
}
