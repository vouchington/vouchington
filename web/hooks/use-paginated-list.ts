'use client'

/** Client-side cursor-page accumulation for append-only lists. */

import { useLayoutEffect, useMemo, useState } from 'react'
import { getPaginatedPage } from '@/lib/api/client'
import type { PaginatedListParams } from './paginated-query-key'
import {
  appendPaginatedPage,
  canPreservePaginationHistory,
  createQueryToken,
  deduplicatePages,
  displacedFirstPage,
  pageInfoKey,
  PaginatedRequestLifecycle,
  type PaginatedData,
} from './use-paginated-list-utils'

export type { PaginatedListParams } from './paginated-query-key'

export type PaginatedPageFetcher<T> = (endpoint: string, params: PaginatedListParams) => Promise<T>
interface UsePaginatedListResult<T> {
  pages: T[]
  hasNextPage: boolean
  endCursor: string | null
  loadMore: () => Promise<void | boolean>
  loadingMore: boolean
  fetchError: Error | null
  clearError: () => void
  replaceFirstPage?: (page: T) => void
  resetToFirstPage?: (page: T) => void
  resetKey: symbol
}

interface UsePaginatedListOptions<T> {
  loadPage?: (after: string) => Promise<T>
  fetchPage?: PaginatedPageFetcher<T>
}

/**
 * Manages accumulated pages for infinite scroll lists.
 * The server component fetches page 1; subsequent pages are fetched client-side.
 *
 * Resets accumulated pages when the query changes (endpoint/params/page_info fingerprint),
 * so stale pages from a previous query are never mixed with a new one. When the fingerprint
 * is unchanged but `initialData` is a new object (e.g. server re-render from modal navigation
 * or `router.refresh()` after a mutation), only `pages[0]` is refreshed in place — accumulated
 * pages are preserved.
 *
 */
export function usePaginatedList<T extends PaginatedData>(
  initialData: T,
  endpoint: string,
  params: PaginatedListParams,
  options: UsePaginatedListOptions<T> = {},
): UsePaginatedListResult<T> {
  const currentKey = pageInfoKey(initialData, endpoint, params)
  const requestLifecycle = useMemo(() => new PaginatedRequestLifecycle(), [])
  const [listState, setListState] = useState<{
    key: string
    sourceInitialData: T
    queryToken: symbol
    pages: T[]
    fetchError: Error | null
    loadingMore: boolean
  }>({
    key: currentKey,
    sourceInitialData: initialData,
    queryToken: requestLifecycle.queryToken,
    pages: deduplicatePages([initialData]),
    fetchError: null,
    loadingMore: false,
  })
  let currentListState = listState
  if (listState.key !== currentKey) {
    currentListState = {
      key: currentKey,
      sourceInitialData: initialData,
      queryToken: createQueryToken(),
      pages: deduplicatePages([initialData]),
      fetchError: null,
      loadingMore: false,
    }
    setListState(currentListState)
  } else if (listState.sourceInitialData !== initialData) {
    currentListState = {
      ...listState,
      sourceInitialData: initialData,
      pages: deduplicatePages([initialData, ...listState.pages.slice(1)]),
    }
    setListState(currentListState)
  }
  useLayoutEffect(() => {
    if (requestLifecycle.queryToken !== listState.queryToken) {
      requestLifecycle.reset(listState.queryToken)
    }
  }, [listState.queryToken, requestLifecycle])
  const currentQueryToken = currentListState.queryToken
  const pages = currentListState.pages
  const fetchError = currentListState.fetchError
  const loadingMore = currentListState.loadingMore

  const lastPage = pages.at(-1)!
  const { has_next_page, end_cursor } = lastPage.page_info

  async function loadMore(): Promise<boolean> {
    if (!has_next_page || !end_cursor || !endpoint) return false
    const requestToken = requestLifecycle.start(currentQueryToken)
    if (!requestToken) return false
    setListState(prev => (prev.queryToken === requestToken ? { ...prev, loadingMore: true } : prev))
    try {
      const nextPageParams = { ...params, after: end_cursor }
      const nextPage = options.fetchPage
        ? await options.fetchPage(endpoint, nextPageParams)
        : options.loadPage
          ? await options.loadPage(end_cursor)
          : await getPaginatedPage<T>(endpoint, nextPageParams)
      if (!requestLifecycle.isCurrent(requestToken)) return true
      setListState(prev =>
        prev.queryToken === requestToken
          ? {
              ...prev,
              pages: appendPaginatedPage(prev.pages, nextPage),
              fetchError: null,
            }
          : prev,
      )
    } catch (error) {
      if (!requestLifecycle.isCurrent(requestToken)) return true
      setListState(prev =>
        prev.queryToken === requestToken
          ? {
              ...prev,
              fetchError: error instanceof Error ? error : new Error('Failed to load more'),
            }
          : prev,
      )
    } finally {
      if (requestLifecycle.isCurrent(requestToken)) {
        requestLifecycle.finish(requestToken)
        setListState(prev =>
          prev.queryToken === requestToken ? { ...prev, loadingMore: false } : prev,
        )
      }
    }
    return true
  }

  function clearError() {
    setListState(prev =>
      prev.queryToken === currentQueryToken ? { ...prev, fetchError: null } : prev,
    )
  }

  function replaceFirstPage(page: T) {
    if (!canPreservePaginationHistory(page, pages[0])) {
      resetToFirstPage(page)
      return
    }
    setListState(prev => {
      if (prev.queryToken !== currentQueryToken) return prev
      const [previousFirstPage, ...olderPages] = prev.pages
      const displacedPage = displacedFirstPage(page, previousFirstPage)
      return {
        ...prev,
        pages: deduplicatePages([page, ...(displacedPage ? [displacedPage] : []), ...olderPages]),
      }
    })
  }

  function resetToFirstPage(page: T) {
    const replacementQueryToken = createQueryToken()
    setListState(prev =>
      prev.queryToken === currentQueryToken
        ? {
            key: currentKey,
            sourceInitialData: initialData,
            queryToken: replacementQueryToken,
            pages: deduplicatePages([page]),
            fetchError: null,
            loadingMore: false,
          }
        : prev,
    )
  }

  return {
    pages,
    hasNextPage: has_next_page,
    endCursor: end_cursor,
    loadMore,
    loadingMore,
    fetchError,
    clearError,
    replaceFirstPage,
    resetToFirstPage,
    resetKey: currentQueryToken,
  }
}
