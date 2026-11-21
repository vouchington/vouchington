'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchCacheGroups } from '@/lib/api/client/valkey'
import type { CacheGroup, FlushConcern } from '@/types/api-responses'
import { isValkeySnapshot, type ValkeySnapshot } from '../stream-snapshots'
import { useSnapshotStream } from '../use-snapshot-stream'
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

const STREAM_FALLBACK_INTERVAL_MS = 10_000

function useValkeyData() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cacheGroups, setCacheGroups] = useState<CacheGroup[]>([])
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
    } catch (err) {
      if (shouldApply()) {
        setError(err instanceof Error ? err.message : 'Failed to load cache groups')
      }
    } finally {
      loadDataPendingRef.current = false
      if (shouldApply()) setLoading(false)
    }
  }

  useSnapshotStream({
    url: '/api/v1/admin/valkey/stream',
    fallbackIntervalMs: STREAM_FALLBACK_INTERVAL_MS,
    loadFallback: shouldApply => loadData(true, shouldApply),
    onSnapshot(event, stopFallback) {
      let parsed: unknown
      const raw: unknown = event.data
      if (typeof raw !== 'string') return
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }
      if (!isValkeySnapshot(parsed)) return
      const data: ValkeySnapshot = parsed
      if (data.groups !== null) {
        streamGroupsAppliedRef.current = true
        setCacheGroups(data.groups ?? [])
        // Partial group errors keep REST polling active so it can fill the missing data.
        if (!data.errors?.groups) stopFallback()
      }
      if (data.errors?.groups) {
        setError(data.errors.groups)
        setLoading(false)
        return
      }
      if (data.groups !== null) setError(null)
      setLoading(false)
    },
  })

  useEffect(() => {
    // Initial REST load so the page is never blank if SSE fails or is slow.
    fetchCacheGroups()
      .then(data => {
        if (!streamGroupsAppliedRef.current) setCacheGroups(data.groups)
      })
      .catch((err: unknown) => {
        if (!streamGroupsAppliedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load cache groups')
        }
      })
      .finally(() => setLoading(false))
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
    setPendingAction(null)
    if (pendingAction.type === 'rebuild') await handleRebuild(pendingAction.target)
    else if (pendingAction.type === 'clear') await handleClearGroup(pendingAction.target)
    else if (pendingAction.type === 'clearAll') await handleClearAll()
    else if (pendingAction.type === 'flush') {
      await handleFlush(
        pendingAction.concern,
        FLUSH_CONCERN_METADATA[pendingAction.concern].requiresForce,
      )
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
