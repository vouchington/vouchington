'use client'

/**
 * Manages the debounced search effect for CommandSearch.
 *
 * Two paths, chosen per keystroke:
 *   "all" tab → single /api/v1/search request
 *   other tab → single per-entity endpoint
 */

import { useEffect } from 'react'
import {
  EMPTY_RESULTS,
  searchByTab,
  type SearchResults,
  type SearchTab,
} from '../command-search-data'
import { fetchCombinedSearch } from '@/lib/api/client/search'
import { fetchFediverseSearch } from '@/lib/api/client/fediverse'

export function useSearchEffect(
  query: string,
  activeTab: SearchTab,
  fediverseEnabled: boolean,
  setResults: (results: SearchResults | ((prev: SearchResults) => SearchResults)) => void,
  setLoading: (loading: boolean) => void,
): void {
  useEffect(() => {
    if (!query.trim()) {
      queueMicrotask(() => {
        setResults(EMPTY_RESULTS)
        setLoading(false)
      })
      return
    }

    queueMicrotask(() => setLoading(true))
    const abortController = new AbortController()
    const signal = abortController.signal

    const timer = setTimeout(async () => {
      if (activeTab === 'all') {
        try {
          const nextResults = await fetchCombinedSearch(query, signal)
          if (!signal.aborted) {
            setResults(nextResults)
            setLoading(false)
          }
          if (fediverseEnabled) {
            const fediverse = await fetchFediverseSearch({ q: query, limit: 3, signal }).catch(
              () => ({ buckets: [] }),
            )
            if (!signal.aborted) {
              setResults(prev => ({
                ...prev,
                fediverse: fediverse.buckets.flatMap(bucket => bucket.items),
              }))
            }
          }
        } catch {
          if (!signal.aborted) {
            setResults(EMPTY_RESULTS)
            setLoading(false)
          }
        }
      } else {
        try {
          const nextResults = await searchByTab(query, activeTab, signal)
          if (!signal.aborted) {
            setResults(nextResults)
            setLoading(false)
          }
        } catch {
          if (!signal.aborted) {
            setResults(EMPTY_RESULTS)
            setLoading(false)
          }
        }
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      abortController.abort()
    }
  }, [query, activeTab, fediverseEnabled, setResults, setLoading])
}
