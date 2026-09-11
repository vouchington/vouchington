'use client'

import { useEffect, useRef, useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { enqueuePsqlJob, fetchMigrations } from '@/lib/api/client/psql'
import type { MigrationStatusResponse } from '@/types/api-responses'

export type PartitionAction = 'createPartitions' | 'cleanupPartitions'
export type PsqlAction =
  | 'runMigrations'
  | 'runViews'
  | 'runConfigDriven'
  | 'createPartitions'
  | 'cleanupPartitions'

export const PARTITION_ACTION_LABELS: Record<PartitionAction, string> = {
  createPartitions: 'Create Partitions',
  cleanupPartitions: 'Cleanup Partitions',
}

export const PARTITION_ACTION_DESCRIPTIONS: Record<PartitionAction, string> = {
  createPartitions:
    'This will create future date-based partitions for all partitioned tables. Safe to run at any time.',
  cleanupPartitions:
    'This will drop expired partitions that are past their retention period. Dropped partitions cannot be recovered.',
}

export const PARTITION_ACTION_TOOLTIPS: Record<PartitionAction, string> = {
  createPartitions: 'Creates future date-based partitions for all partitioned tables',
  cleanupPartitions: 'Drops expired partitions that are past their retention period',
}

type PostgreSQLStreamSnapshot = MigrationStatusResponse | { error: string }
const STREAM_FALLBACK_INTERVAL_MS = 30_000

export function usePostgreSQLAdminState() {
  const [status, setStatus] = useState<MigrationStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [pendingAction, setPendingAction] = useState<PartitionAction | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const streamSnapshotAppliedRef = useRef(false)
  const loadDataPendingRef = useRef(false)

  async function loadData(silent = false, shouldApply: () => boolean = () => true) {
    if (loadDataPendingRef.current) return
    loadDataPendingRef.current = true
    if (!silent) setLoading(true)
    try {
      const nextStatus = await fetchMigrations()
      if (shouldApply()) {
        setError(null)
        setStatus(nextStatus)
      }
    } catch (error) {
      if (shouldApply()) {
        setError(error instanceof Error ? error.message : 'Failed to load PostgreSQL status')
      }
    } finally {
      loadDataPendingRef.current = false
      if (shouldApply()) setLoading(false)
    }
  }

  useEffect(() => {
    const es = new EventSource('/api/v1/admin/postgresql/stream')
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
      let data: PostgreSQLStreamSnapshot
      try {
        data = JSON.parse(event.data) as PostgreSQLStreamSnapshot
      } catch {
        return
      }
      if ('error' in data) {
        setError(data.error)
        setLoading(false)
        return
      }
      setStatus(data)
      stopRestFallback()
      setError(null)
      setLoading(false)
      streamSnapshotAppliedRef.current = true
    }

    es.addEventListener('snapshot', onSnapshot)
    es.onerror = startRestFallback

    // Initial REST load so the page is never blank if SSE fails or is slow.
    fetchMigrations()
      .then(data => setStatus(prev => prev ?? data))
      .catch(error => {
        if (streamSnapshotAppliedRef.current) return
        setError(error instanceof Error ? error.message : 'Failed to load PostgreSQL status')
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

  async function handleAction(type: PsqlAction) {
    setActionLoading(prev => ({ ...prev, [type]: true }))
    try {
      await enqueuePsqlJob(type)
      onSuccess(`${type} job queued`)
      await loadData()
    } catch (error) {
      onError(error, { fallback: `Failed to run ${type}`, tags: { form: 'admin-partition' } })
    } finally {
      setActionLoading(prev => ({ ...prev, [type]: false }))
    }
  }

  async function confirmPartitionAction() {
    if (!pendingAction) return
    const action = pendingAction
    setPendingAction(null)
    await handleAction(action)
  }

  return {
    actionLoading,
    confirmPartitionAction,
    error,
    handleAction,
    loadData,
    loading,
    pendingAction,
    setPendingAction,
    status,
  }
}
