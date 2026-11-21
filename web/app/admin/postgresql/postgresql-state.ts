'use client'
import { useEffect, useRef, useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { enqueuePsqlJob, fetchMigrations } from '@/lib/api/client/psql'
import type { MigrationStatusResponse } from '@/types/api-responses'
import { isPostgreSQLStreamSnapshot } from '../stream-snapshots'
import { useSnapshotStream } from '../use-snapshot-stream'
export type PartitionAction = 'createPartitions' | 'cleanupPartitions'
export type ClassifierPartitionRange = { fromDate: string; toDate: string; maxDefaultRows?: number }
export type RequestPartitionRange = ClassifierPartitionRange
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
  createPartitions: 'This will create future monthly partitions for crawl and RSS history tables.',
  cleanupPartitions:
    'This will drop expired partitions that are past their retention period. Dropped partitions cannot be recovered.',
}
export const PARTITION_ACTION_TOOLTIPS: Record<PartitionAction, string> = {
  createPartitions: 'Creates future monthly crawl and RSS history partitions',
  cleanupPartitions: 'Drops expired partitions that are past their retention period',
}
const STREAM_FALLBACK_INTERVAL_MS = 30_000
export function usePostgreSQLAdminState() {
  const [status, setStatus] = useState<MigrationStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [pendingAction, setPendingAction] = useState<PartitionAction | null>(null)
  const [pendingClassifierRange, setPendingClassifierRange] =
    useState<ClassifierPartitionRange | null>(null)
  const [pendingRequestRange, setPendingRequestRange] = useState<RequestPartitionRange | null>(null)
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
    } catch (err) {
      if (shouldApply()) {
        setError(err instanceof Error ? err.message : 'Failed to load PostgreSQL status')
      }
    } finally {
      loadDataPendingRef.current = false
      if (shouldApply()) setLoading(false)
    }
  }

  useSnapshotStream({
    url: '/api/v1/admin/postgresql/stream',
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
      if (!isPostgreSQLStreamSnapshot(parsed)) return
      if ('error' in parsed) {
        setError(parsed.error)
        setLoading(false)
        return
      }
      setStatus(parsed)
      stopFallback()
      setError(null)
      setLoading(false)
      streamSnapshotAppliedRef.current = true
    },
  })

  useEffect(() => {
    // Initial REST load so the page is never blank if SSE fails or is slow.
    fetchMigrations()
      .then(data => setStatus(prev => prev ?? data))
      .catch((err: unknown) => {
        if (streamSnapshotAppliedRef.current) return
        setError(err instanceof Error ? err.message : 'Failed to load PostgreSQL status')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleAction(
    type: PsqlAction,
    ranges?: { classifierRange?: ClassifierPartitionRange; requestRange?: RequestPartitionRange },
  ) {
    setActionLoading(prev => ({ ...prev, [type]: true }))
    try {
      await enqueuePsqlJob(type, ranges)
      onSuccess(`${type} job queued`)
      await loadData()
    } catch (err) {
      onError(err, { fallback: `Failed to run ${type}`, tags: { form: 'admin-partition' } })
    } finally {
      setActionLoading(prev => ({ ...prev, [type]: false }))
    }
  }

  async function confirmPartitionAction() {
    if (!pendingAction) return
    setPendingAction(null)
    setPendingClassifierRange(null)
    setPendingRequestRange(null)
    await handleAction(
      pendingAction,
      pendingClassifierRange || pendingRequestRange
        ? {
            ...(pendingClassifierRange ? { classifierRange: pendingClassifierRange } : {}),
            ...(pendingRequestRange ? { requestRange: pendingRequestRange } : {}),
          }
        : undefined,
    )
  }

  function choosePartitionAction(action: PartitionAction | null) {
    setPendingClassifierRange(null)
    setPendingRequestRange(null)
    setPendingAction(action)
  }

  function chooseClassifierPartitionAction(
    action: PartitionAction,
    range: ClassifierPartitionRange,
  ) {
    setPendingClassifierRange(range)
    setPendingRequestRange(null)
    setPendingAction(action)
  }

  function chooseRequestPartitionAction(action: PartitionAction, range: RequestPartitionRange) {
    setPendingClassifierRange(null)
    setPendingRequestRange(range)
    setPendingAction(action)
  }

  return {
    actionLoading,
    chooseClassifierPartitionAction,
    chooseRequestPartitionAction,
    pendingRequestRange,
    choosePartitionAction,
    confirmPartitionAction,
    error,
    handleAction,
    loadData,
    loading,
    pendingAction,
    pendingClassifierRange,
    status,
  }
}
