'use client'

import { useState } from 'react'

export function useLoadingIds() {
  const [loadingCounts, setLoadingCounts] = useState<Map<string, number>>(
    () => new Map<string, number>(),
  )
  const loadingIds = new Set<string>(loadingCounts.keys())

  function addLoadingId(id: string) {
    setLoadingCounts(prev => {
      const next = new Map<string, number>(prev)
      next.set(id, (next.get(id) ?? 0) + 1)
      return next
    })
  }

  function removeLoadingId(id: string) {
    setLoadingCounts(prev => {
      const count = prev.get(id)
      if (!count) return prev
      const next = new Map<string, number>(prev)
      if (count === 1) {
        next.delete(id)
      } else {
        next.set(id, count - 1)
      }
      return next
    })
  }

  async function runWithLoadingId<T>(id: string, task: () => Promise<T>): Promise<T> {
    addLoadingId(id)
    try {
      return await task()
    } finally {
      removeLoadingId(id)
    }
  }

  return { loadingIds, addLoadingId, removeLoadingId, runWithLoadingId }
}
