import type { Dispatch, SetStateAction } from 'react'
import type { ModerationBulkAction } from '@/components/moderation/bulk-action-toolbar'
import {
  formatModerationBulkMessage,
  runModerationBulkOperations,
} from '@/components/moderation/bulk-operations'
import { deletePost } from '@/lib/api/client/post-mutations'
import { resolveModerationReport, type MemberModerationReport } from '@/lib/api/client/reports'
import { buildReportBulkOperations } from './reports-bulk-operations'
import type { AdminModerationReport } from './reports-client-types'

export async function runFlatReportsBulk({
  action,
  canBulkRemove,
  pendingRerunEntities,
  refresh,
  reports,
  selectedIds,
  setBulkAction,
  setBulkLoading,
  setBulkMessage,
  setResolvedIds,
  setSelectedIds,
  viewerTier,
}: {
  action: ModerationBulkAction
  canBulkRemove: boolean
  pendingRerunEntities: ReadonlySet<string>
  refresh: () => void
  reports: AdminModerationReport[] | MemberModerationReport[]
  selectedIds: ReadonlySet<string>
  setBulkAction: Dispatch<SetStateAction<ModerationBulkAction | null>>
  setBulkLoading: Dispatch<SetStateAction<boolean>>
  setBulkMessage: Dispatch<SetStateAction<string | null>>
  setResolvedIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setSelectedIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  viewerTier: 'staff' | 'member'
}) {
  if (viewerTier !== 'staff') return

  const deletePromises = new Map<string, Promise<void>>()
  const deleteEntityOnce = (entityId: string) => {
    const existing = deletePromises.get(entityId)
    if (existing) return existing
    const promise = deletePost(entityId)
    deletePromises.set(entityId, promise)
    return promise
  }
  const { operations, skippedIds } = buildReportBulkOperations({
    action,
    canBulkRemove,
    deleteEntityOnce,
    onResolved: reportId => setResolvedIds(current => new Set(current).add(reportId)),
    reports: reports as AdminModerationReport[],
    resolveReport: resolveModerationReport,
    selectedIds,
    pendingRerunEntities,
  })

  setBulkLoading(true)
  try {
    const failedIds = await runModerationBulkOperations(operations)
    const remaining = new Set<string>([...failedIds, ...skippedIds])
    const succeeded = operations.length - failedIds.size
    setSelectedIds(remaining)
    setBulkAction(null)
    setBulkMessage(
      formatModerationBulkMessage({
        succeeded,
        failed: failedIds.size,
        skipped: skippedIds.size,
      }),
    )
    if (succeeded > 0) refresh()
  } finally {
    setBulkLoading(false)
  }
}
