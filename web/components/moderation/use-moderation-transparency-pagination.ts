'use client'

import { useState } from 'react'
import {
  fetchCommunityModerationTransparency,
  fetchModerationTransparency,
} from '@/lib/api/client/moderation-transparency'
import type { ModerationTransparency } from '@/types/moderation-analytics'
import { ApiError } from '@/lib/api/error'

export function useModerationTransparencyPagination(
  transparency: ModerationTransparency | null | undefined,
  communitySlug?: string,
) {
  const [continuation, setContinuation] = useState<{
    base: typeof transparency
    data: ModerationTransparency | null
  } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetchError, setFetchError] = useState<Error | null>(null)
  const displayed = continuation?.base === transparency ? continuation?.data : transparency
  async function loadOlder() {
    if (!displayed?.next_cursor) return
    setFetchError(null)
    setLoadingMore(true)
    try {
      const next = communitySlug
        ? await fetchCommunityModerationTransparency(communitySlug, {
            range: 'all',
            after: displayed.next_cursor,
          })
        : await fetchModerationTransparency({ range: 'all', after: displayed.next_cursor })
      setContinuation({
        base: transparency,
        data: { ...next, buckets: [...displayed.buckets, ...next.buckets] },
      })
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        setContinuation({ base: transparency, data: null })
        setFetchError(null)
      } else {
        setFetchError(error instanceof Error ? error : new Error('load failed'))
      }
    } finally {
      setLoadingMore(false)
    }
  }
  return { displayed, fetchError, loadingMore, clearError: () => setFetchError(null), loadOlder }
}
