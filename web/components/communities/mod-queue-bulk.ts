import type { Dispatch, SetStateAction, TransitionStartFunction } from 'react'
import type { ModerationBulkAction } from '@/components/moderation/bulk-action-toolbar'
import {
  formatModerationBulkMessage,
  runModerationBulkOperations,
  type ModerationBulkOperation,
} from '@/components/moderation/bulk-operations'
import { rejectPost, unpublishCommunityPost } from '@/lib/api/client'
import { deletePost } from '@/lib/api/client/post-mutations'
import { resolveCommunityModerationReport } from '@/lib/api/client/reports'
import type { CommunityModerationReport } from '@/types/api-responses'
import type { ModQueueAction, ModQueueSelectionKey } from './mod-queue-state'

export async function confirmModQueueBulk({
  action,
  communitySlug,
  queue,
  selection,
}: {
  action: ModerationBulkAction
  communitySlug: string
  queue: {
    dispatch: Dispatch<ModQueueAction>
    refresh: () => void
    reportsById: ReadonlyMap<string, CommunityModerationReport>
    startTransition: TransitionStartFunction
  }
  selection: {
    bulkReason: string
    selectedKeys: ReadonlySet<ModQueueSelectionKey>
    setBulkAction: Dispatch<SetStateAction<ModerationBulkAction | null>>
    setBulkLoading: Dispatch<SetStateAction<boolean>>
    setBulkMessage: Dispatch<SetStateAction<string | null>>
    setSelectedKeys: Dispatch<SetStateAction<ReadonlySet<ModQueueSelectionKey>>>
  }
}) {
  const { dispatch, refresh, reportsById, startTransition } = queue
  const {
    bulkReason,
    selectedKeys,
    setBulkAction,
    setBulkLoading,
    setBulkMessage,
    setSelectedKeys,
  } = selection
  const selected = new Set(selectedKeys)
  const operations: ModerationBulkOperation<ModQueueSelectionKey>[] = []
  const skippedKeys = new Set<ModQueueSelectionKey>()
  const normalizedBulkReason = bulkReason.trim().slice(0, 1000)
  const rejectPromises = new Map<string, Promise<void>>()
  const unpublishPromises = new Map<string, Promise<void>>()
  const deletePromises = new Map<string, Promise<void>>()

  const rejectPostOnce = (postId: string) => {
    const existing = rejectPromises.get(postId)
    if (existing) return existing
    const promise = rejectPost(communitySlug, postId, normalizedBulkReason)
    rejectPromises.set(postId, promise)
    return promise
  }

  const unpublishPostOnce = (postId: string) => {
    const existing = unpublishPromises.get(postId)
    if (existing) return existing
    const promise = unpublishCommunityPost(communitySlug, postId)
    unpublishPromises.set(postId, promise)
    return promise
  }

  const deleteCommentOnce = (commentId: string) => {
    const existing = deletePromises.get(commentId)
    if (existing) return existing
    const promise = deletePost(commentId)
    deletePromises.set(commentId, promise)
    return promise
  }

  for (const key of selected) {
    if (key.startsWith('post:')) {
      if (action === 'dismiss') {
        skippedKeys.add(key)
        continue
      }
      const postId = key.slice(5)
      operations.push({
        id: key,
        run: async () => {
          await rejectPostOnce(postId)
          dispatch({ type: 'post-resolved', postId })
        },
      })
    }
  }

  for (const key of selected) {
    if (!key.startsWith('report:')) continue
    const reportId = key.slice(7)
    const report = reportsById.get(reportId)
    if (!report) {
      skippedKeys.add(key)
      continue
    }

    if (report.status !== 'pending' || report.community_ban_evasion) {
      skippedKeys.add(key)
      continue
    }

    if (action === 'dismiss') {
      operations.push({
        id: key,
        run: async () => {
          await resolveCommunityModerationReport(communitySlug, report.id, 'dismissed')
          dispatch({ type: 'report-resolved', reportId: report.id })
        },
      })
      continue
    }

    if (report.entity_type === 'post' && report.target_pending_community_review === true) {
      operations.push({
        id: key,
        run: async () => {
          await rejectPostOnce(report.entity_id)
          dispatch({ type: 'post-resolved', postId: report.entity_id })
          await resolveCommunityModerationReport(communitySlug, report.id, 'reviewed')
          dispatch({ type: 'report-resolved', reportId: report.id })
        },
      })
    } else if (report.entity_type === 'post') {
      operations.push({
        id: key,
        run: async () => {
          await unpublishPostOnce(report.entity_id)
          await resolveCommunityModerationReport(communitySlug, report.id, 'reviewed')
          dispatch({ type: 'report-resolved', reportId: report.id })
        },
      })
    } else if (report.entity_type === 'comment') {
      operations.push({
        id: key,
        run: async () => {
          await deleteCommentOnce(report.entity_id)
          dispatch({ type: 'report-resolved', reportId: report.id })
        },
      })
    } else {
      skippedKeys.add(key)
    }
  }

  setBulkLoading(true)
  try {
    const failedKeys = await runModerationBulkOperations(operations)
    const remaining = new Set<ModQueueSelectionKey>([...failedKeys, ...skippedKeys])
    const succeeded = operations.length - failedKeys.size
    setSelectedKeys(remaining)
    setBulkAction(null)
    setBulkMessage(
      formatModerationBulkMessage({
        succeeded,
        failed: failedKeys.size,
        skipped: skippedKeys.size,
      }),
    )
    if (succeeded > 0)
      startTransition(() => {
        refresh()
      })
  } finally {
    setBulkLoading(false)
  }
}
