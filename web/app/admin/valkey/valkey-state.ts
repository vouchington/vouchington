'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchCacheGroups } from '@/lib/api/client/valkey'
import type { CacheGroup, FlushConcern } from '@/types/api-responses'
import { useBloomFilterActions, useCacheActions, useFlushActions } from './valkey-action-hooks'

export type PendingValkeyAction =
  | { type: 'rebuild'; target: string }
  | { type: 'clear'; target: string }
  | { type: 'clearAll' }
  | { type: 'flush'; concern: FlushConcern }

export const BLOOM_FILTERS = [
  'url-blocklist',
  'email-blocklist',
  'embedding',
  'entity-cache',
] as const

export const FLUSH_CONCERN_METADATA: Record<
  FlushConcern,
  { description: string; requiresForce: boolean }
> = {
  caches: {
    description: 'Clears all 6 entity cache groups (users, topics, posts, rss, urls, elections).',
    requiresForce: false,
  },
  'recently-viewed': {
    description: 'Clears all recently-viewed history entries.',
    requiresForce: false,
  },
  blooms: {
    description: 'Clears all bloom filter keys. Filters will need to be rebuilt.',
    requiresForce: false,
  },
  'rate-limiter': {
    description: 'Resets all rate limiter state.',
    requiresForce: false,
  },
  'dynamic-config': {
    description: 'Clears all cached dynamic config values.',
    requiresForce: false,
  },
  sessions: {
    description:
      'Logs out every signed-in user and invalidates all in-flight passkey, MFA, and OAuth challenges. This cannot be undone.',
    requiresForce: true,
  },
  queues: {
    description: 'Empties every queue. Enqueued jobs will be lost.',
    requiresForce: false,
  },
}

interface ValkeySnapshot {
  groups: CacheGroup[] | null
  errors?: {
    groups?: string
  }
}

const STREAM_FALLBACK_INTERVAL_MS = 10_000

function useValkeyData() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cacheGroups, setCacheGroups] = useState<CacheGroup[]>([])
  const esRef = useRef<EventSource | null>(null)
  const streamGroupsAppliedRef = useRef(false)
  const loadDataPendingRef = useRef(false)

  async function loadData(silent = false, shouldApply: () => boolean = () => true) {
    if (loadDataPendingRef.current) return
    loadDataPendingRef.current = true
    // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare -- intentional: guards against non-boolean truthy values bypassing TypeScript types at runtime
    const silentLoad = silent === true
    if (!silentLoad) setLoading(true)
    try {
      const cacheGroupsResult = await fetchCacheGroups()
      if (shouldApply()) {
        setError(null)
        setCacheGroups(cacheGroupsResult.groups)
      }
    } catch (error) {
      if (shouldApply()) {
        setError(error instanceof Error ? error.message : 'Failed to load cache groups')
      }
    } finally {
      loadDataPendingRef.current = false
      if (shouldApply()) setLoading(false)
    }
  }

  useEffect(() => {
    const es = new EventSource('/api/v1/admin/valkey/stream')
    esRef.current = es
    let fallbackInterval: ReturnType<typeof setInterval> | null = null
    let fallbackGeneration = 0

    function runRestFallback() {
      const generation = fallbackGeneration
      void loadData(true, () => generation === fallbackGeneration)
    }

    function startRestFallback() {
      if (fallbackInterval !== null) return
      runRestFallback()
      fallbackInterval = setInterval(runRestFallback, STREAM_FALLBACK_INTERVAL_MS)
    }

    function stopRestFallback() {
      fallbackGeneration += 1
      if (fallbackInterval !== null) {
        clearInterval(fallbackInterval)
        fallbackInterval = null
      }
    }

    function onSnapshot(event: MessageEvent) {
      let data: ValkeySnapshot
      try {
        data = JSON.parse(event.data) as ValkeySnapshot
      } catch {
        return
      }
      if (data.groups !== null) {
        streamGroupsAppliedRef.current = true
        setCacheGroups(data.groups ?? [])
        // Partial group errors keep REST polling active so it can fill the missing data.
        if (!data.errors?.groups) stopRestFallback()
      }
      if (data.errors?.groups) {
        setError(data.errors.groups)
        setLoading(false)
        return
      }
      if (data.groups !== null) setError(null)
      setLoading(false)
    }

    es.addEventListener('snapshot', onSnapshot)
    es.onerror = startRestFallback

    // Initial REST load so the page is never blank if SSE fails or is slow.
    fetchCacheGroups()
      .then(data => {
        if (!streamGroupsAppliedRef.current) setCacheGroups(data.groups)
      })
      .catch((error: unknown) => {
        if (!streamGroupsAppliedRef.current) {
          setError(error instanceof Error ? error.message : 'Failed to load cache groups')
        }
      })
      .finally(() => setLoading(false))

    return () => {
      es.removeEventListener('snapshot', onSnapshot)
      es.close()
      esRef.current = null
      fallbackGeneration += 1
      if (fallbackInterval !== null) clearInterval(fallbackInterval)
    }
  }, [])

  return { loading, error, cacheGroups, loadData }
}

export function useValkeyAdminState() {
  const [pendingAction, setPendingAction] = useState<PendingValkeyAction | null>(null)
  const { loading, error, cacheGroups, loadData } = useValkeyData()
  const { rebuildLoading, handleRebuild } = useBloomFilterActions()
  const { clearLoading, handleClearGroup, handleClearAll } = useCacheActions()
  const { flushLoading, handleFlush } = useFlushActions()

  const confirmAction = async () => {
    if (!pendingAction) return
    const action = pendingAction
    setPendingAction(null)
    if (action.type === 'rebuild') await handleRebuild(action.target)
    else if (action.type === 'clear') await handleClearGroup(action.target)
    else if (action.type === 'clearAll') await handleClearAll()
    else if (action.type === 'flush') {
      await handleFlush(action.concern, FLUSH_CONCERN_METADATA[action.concern].requiresForce)
    }
  }

  return {
    cacheGroups,
    clearLoading,
    confirmAction,
    error,
    flushLoading,
    loadData,
    loading,
    pendingAction,
    rebuildLoading,
    setPendingAction,
  }
}
