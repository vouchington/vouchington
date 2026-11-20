'use client'

import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { fetchContentLimits, type ContentLimitsResponse } from '@/lib/api/client/content-limits'

/**
 * The server's configured content caps, or null until they load or when the read fails. Callers
 * apply no client-side cap while null; the server still rejects an over-cap write with a coded error.
 */
export function useContentLimits(): ContentLimitsResponse | null {
  const [limits, setLimits] = useState<ContentLimitsResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchContentLimits()
      .then(loaded => {
        if (!cancelled) setLimits(loaded)
      })
      .catch(Sentry.captureException)
    return () => {
      cancelled = true
    }
  }, [])

  return limits
}
