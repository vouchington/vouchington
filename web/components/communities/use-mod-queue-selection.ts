'use client'

import { useMemo, useState } from 'react'
import type { ModerationBulkAction } from '@/components/moderation/bulk-action-toolbar'
import type { ModQueueSelectionKey } from './mod-queue-state'

export function useModQueueSelection({
  isPending,
  loading,
}: {
  isPending: boolean
  loading: string | null
}) {
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<ModQueueSelectionKey>>(
    () => new Set(),
  )
  const [bulkAction, setBulkAction] = useState<ModerationBulkAction | null>(null)
  const [bulkReason, setBulkReason] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const mutationsDisabled = bulkLoading || loading !== null || isPending
  const selectedReportIds = useMemo(
    () =>
      new Set([...selectedKeys].flatMap(key => (key.startsWith('report:') ? [key.slice(7)] : []))),
    [selectedKeys],
  )
  const selectedPostIds = useMemo(
    () =>
      new Set([...selectedKeys].flatMap(key => (key.startsWith('post:') ? [key.slice(5)] : []))),
    [selectedKeys],
  )

  function toggleSelected(key: ModQueueSelectionKey) {
    if (mutationsDisabled) return
    setBulkMessage(null)
    setSelectedKeys(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function clearSelected(key: ModQueueSelectionKey) {
    setSelectedKeys(current => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  return {
    bulkAction,
    bulkLoading,
    bulkMessage,
    bulkReason,
    clearSelected,
    mutationsDisabled,
    selectedKeys,
    selectedPostIds,
    selectedReportIds,
    setBulkAction,
    setBulkLoading,
    setBulkMessage,
    setBulkReason,
    setSelectedKeys,
    toggleSelected,
  }
}

export type ModQueueSelection = ReturnType<typeof useModQueueSelection>
