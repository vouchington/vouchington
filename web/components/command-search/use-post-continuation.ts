'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { fetchCombinedSearch } from '@/lib/api/client/search'
import { searchPostsOnly } from '../command-search-data-search'
import type { SearchResults, SearchTab } from '../command-search-data'

export function usePostContinuation(
  query: string,
  activeTab: SearchTab,
  results: SearchResults,
  setResults: Dispatch<SetStateAction<SearchResults>>,
) {
  const key = `${activeTab}\0${query}`
  const controllerRef = useRef<AbortController | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  useEffect(
    () => () => {
      controllerRef.current?.abort()
      controllerRef.current = null
    },
    [key],
  )

  const cursor = results.posts_page_info?.end_cursor
  const canLoadMore =
    (activeTab === 'all' || activeTab === 'posts') &&
    results.searchKey === key &&
    Boolean(results.posts_page_info?.has_next_page && cursor)

  async function handleLoadMore() {
    if (!canLoadMore || !cursor || controllerRef.current) return
    const controller = new AbortController()
    controllerRef.current = controller
    setLoadingKey(key)
    setErrorKey(null)
    try {
      const next =
        activeTab === 'all'
          ? await fetchCombinedSearch(query, controller.signal, cursor)
          : await searchPostsOnly(query, controller.signal, cursor)
      if (controller.signal.aborted) return
      setResults(previous => {
        if (previous.searchKey !== key || previous.posts_page_info?.end_cursor !== cursor)
          return previous
        const seenIds = new Set(previous.posts.map(post => post.id))
        return {
          ...previous,
          posts: [...previous.posts, ...next.posts.filter(post => !seenIds.has(post.id))],
          posts_page_info: next.posts_page_info,
        }
      })
    } catch {
      if (!controller.signal.aborted) setErrorKey(key)
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setLoadingKey(previous => (previous === key ? null : previous))
    }
  }

  return {
    canLoadMore,
    handleLoadMore,
    loadingMore: loadingKey === key,
    loadError: errorKey === key,
  }
}
