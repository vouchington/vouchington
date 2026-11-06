'use client'

import {
  usePaginatedList as usePackagePaginatedList,
  type PaginatedData,
  type PaginatedListParams,
  type PaginatedPageFetcher,
} from '@vouchington/api-client/paginated-list'
import { useLayoutEffect, useRef } from 'react'
import { getPaginatedPage } from '@/lib/api/client'
import { useOptionalAuth } from '@/lib/auth/context'

export type { PaginatedListParams }

interface UsePaginatedListOptions<T> {
  loadPage?: (after: string) => Promise<T>
  fetchPage?: PaginatedPageFetcher<T>
}

/** Cursor-page accumulation that continues through the app's paginated API client by default. */
export function usePaginatedList<T extends PaginatedData>(
  initialData: T,
  endpoint: string,
  params: PaginatedListParams,
  { loadPage, fetchPage }: UsePaginatedListOptions<T> = {},
) {
  const pagination = usePackagePaginatedList(initialData, endpoint, params, {
    ...(loadPage ? { loadPage } : {}),
    fetchPage:
      fetchPage ?? (loadPage ? undefined : (path, query) => getPaginatedPage<T>(path, query)),
  } as Parameters<typeof usePackagePaginatedList<T>>[3])
  const viewerId = useOptionalAuth()?.currentUser?.id ?? null
  const previousViewerId = useRef(viewerId)
  const pendingViewerRefresh = useRef(false)
  const resetKeyBeforeViewerReset = useRef(pagination.resetKey)
  const fetchFirstPage = () =>
    fetchPage ? fetchPage(endpoint, params) : getPaginatedPage<T>(endpoint, params)

  useLayoutEffect(() => {
    if (previousViewerId.current !== viewerId) {
      previousViewerId.current = viewerId
      pendingViewerRefresh.current = true
      resetKeyBeforeViewerReset.current = pagination.resetKey
      pagination.resetToFirstPage(initialData)
      return
    }
    if (pendingViewerRefresh.current && pagination.resetKey !== resetKeyBeforeViewerReset.current) {
      pendingViewerRefresh.current = false
      if (endpoint && (!loadPage || fetchPage)) void pagination.refreshLoadedPages(fetchFirstPage)
    }
  })

  return pagination
}
