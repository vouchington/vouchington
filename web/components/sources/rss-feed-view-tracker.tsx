'use client'

import { useEffect, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import { trackRssFeedView } from '@/lib/api/client/rss-feed-analytics'

interface Props {
  rssFeedId: string
}

export function RssFeedViewTracker({ rssFeedId }: Props) {
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    trackRssFeedView(rssFeedId).catch(Sentry.captureException)
  }, [rssFeedId])

  return null
}
