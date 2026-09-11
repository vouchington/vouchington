'use client'

import { useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { clearCache, flushValkey, rebuildBloomFilter } from '@/lib/api/client/valkey'
import type { FlushConcern } from '@/types/api-responses'

export function useBloomFilterActions() {
  const [rebuildLoading, setRebuildLoading] = useState<Record<string, boolean>>({})

  const handleRebuild = async (filter: string) => {
    setRebuildLoading(prev => ({ ...prev, [filter]: true }))
    try {
      await rebuildBloomFilter(filter)
      onSuccess('Rebuild job queued')
    } catch (error) {
      onError(error, { fallback: 'Failed to queue rebuild', tags: { form: 'admin-valkey' } })
    } finally {
      setRebuildLoading(prev => ({ ...prev, [filter]: false }))
    }
  }

  return { rebuildLoading, handleRebuild }
}

export function useCacheActions() {
  const [clearLoading, setClearLoading] = useState<Record<string, boolean>>({})

  const handleClearGroup = async (group: string) => {
    setClearLoading(prev => ({ ...prev, [group]: true }))
    try {
      await clearCache(group)
      onSuccess(`Cleared cache group: ${group}`)
    } catch (error) {
      onError(error, { fallback: 'Failed to clear cache', tags: { form: 'admin-valkey' } })
    } finally {
      setClearLoading(prev => ({ ...prev, [group]: false }))
    }
  }

  const handleClearAll = async () => {
    setClearLoading(prev => ({ ...prev, all: true }))
    try {
      await clearCache('all')
      onSuccess('All caches cleared')
    } catch (error) {
      onError(error, { fallback: 'Failed to clear all caches', tags: { form: 'admin-valkey' } })
    } finally {
      setClearLoading(prev => ({ ...prev, all: false }))
    }
  }

  return { clearLoading, handleClearGroup, handleClearAll }
}

export function useFlushActions() {
  const [flushLoading, setFlushLoading] = useState<Record<string, boolean>>({})

  const handleFlush = async (concern: FlushConcern, force?: boolean) => {
    setFlushLoading(prev => ({ ...prev, [concern]: true }))
    try {
      const result = await flushValkey(concern, force)
      onSuccess(
        result.keysRemoved !== null
          ? `Flushed ${concern} (${result.keysRemoved} keys removed)`
          : `Flushed ${concern}`,
      )
    } catch (error) {
      onError(error, { fallback: 'Failed to flush', tags: { form: 'admin-valkey' } })
    } finally {
      setFlushLoading(prev => ({ ...prev, [concern]: false }))
    }
  }

  return { flushLoading, handleFlush }
}
