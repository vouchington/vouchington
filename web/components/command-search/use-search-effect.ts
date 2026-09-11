'use client'

/**
 * Manages the debounced search effect for CommandSearch.
 *
 * Three paths, chosen per keystroke:
 *   combinedSearch ON  → single /api/v1/search request
 *   flag OFF + "all"   → progressive fan-out: fast verticals render first
 *   flag OFF + tab     → single per-entity endpoint
 */

import { useEffect } from 'react'
import {
  EMPTY_RESULTS,
  searchByTab,
  type SearchResults,
  type SearchTab,
} from '../command-search-data'
import { searchAllProgressive } from '../command-search-data-search'
import { fetchCombinedSearch } from '@/lib/api/client/search'
import { fetchFediverseSearch } from '@/lib/api/client/fediverse'

export function useSearchEffect(
  query: string,
  activeTab: SearchTab,
  combinedSearchEnabled: boolean,
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
      if (combinedSearchEnabled && activeTab === 'all') {
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
      } else if (activeTab === 'all') {
        if (!signal.aborted) setResults(EMPTY_RESULTS)
        try {
          await searchAllProgressive(query, signal, partial => {
            if (!signal.aborted) setResults(prev => ({ ...prev, ...partial }))
          })
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
        } finally {
          if (!signal.aborted) setLoading(false)
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
  }, [query, activeTab, combinedSearchEnabled, fediverseEnabled, setResults, setLoading])
}
