'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { toast } from 'sonner'
import { getPaginatedPage } from '@/lib/api/client'
import { getMyUnreadNotificationsSummaryClient } from '@/lib/api/client/my'
import type { NotificationsResponseBody } from '@/types/api-responses'

/** Revalidates one list page and the unread count only on explicit events. */
export function useMarkAllReadProgress(
  resetToFirstPage: (page: NotificationsResponseBody) => void,
) {
  const [readAllPending, setReadAllPending] = useState(false)
  const [refreshingReadState, setRefreshingReadState] = useState(false)
  const refreshInFlight = useRef(false)

  async function refreshReadState() {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshingReadState(true)
    try {
      const [firstPage, summary] = await Promise.all([
        getPaginatedPage<NotificationsResponseBody>('/api/v1/my/notifications', {}),
        getMyUnreadNotificationsSummaryClient(),
      ])
      resetToFirstPage(firstPage)
      setReadAllPending(summary.unread_count > 0)
    } catch {
      toast.error('Failed to load notifications.')
    } finally {
      refreshInFlight.current = false
      setRefreshingReadState(false)
    }
  }

  const refreshOnFocus = useEffectEvent(() => {
    refreshReadState().catch(Sentry.captureException)
  })
  useEffect(() => {
    if (!readAllPending) return
    const onVisibilityChange = () => {
      if (!document.hidden) refreshOnFocus()
    }
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [readAllPending])

  return { readAllPending, refreshingReadState, refreshReadState, setReadAllPending }
}
