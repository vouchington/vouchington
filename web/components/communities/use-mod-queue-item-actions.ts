'use client'

import type { Dispatch, TransitionStartFunction } from 'react'
import { approvePost, rejectPost } from '@/lib/api/client'
import { resolveCommunityModerationReport } from '@/lib/api/client/reports'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CommunityModerationReport } from '@/types/api-responses'
import type { ModQueueAction, ModQueueSelectionKey } from './mod-queue-state'

export function useModQueueItemActions({
  clearSelected,
  communitySlug,
  dispatch,
  refresh,
  rejectionReason,
  startTransition,
}: {
  clearSelected: (key: ModQueueSelectionKey) => void
  communitySlug: string
  dispatch: Dispatch<ModQueueAction>
  refresh: () => void
  rejectionReason: string
  startTransition: TransitionStartFunction
}) {
  const t = useTranslations()

  async function handleApprove(postId: string) {
    dispatch({ type: 'start', id: postId })
    try {
      await approvePost(communitySlug, postId)
      dispatch({ type: 'post-resolved', postId })
      clearSelected(`post:${postId}`)
      startTransition(() => {
        refresh()
      })
    } catch (err) {
      dispatch({
        type: 'fail',
        message:
          err instanceof Error
            ? err.message
            : t('extracted.communities.modQueue.failedToApprovePost_fe0bb0b7'),
      })
    } finally {
      dispatch({ type: 'stop' })
    }
  }

  async function handleRejectSubmit(postId: string) {
    dispatch({ type: 'start', id: postId })
    try {
      await rejectPost(communitySlug, postId, rejectionReason)
      dispatch({ type: 'post-resolved', postId })
      dispatch({ type: 'reject-cancelled' })
      clearSelected(`post:${postId}`)
      startTransition(() => {
        refresh()
      })
    } catch (err) {
      dispatch({
        type: 'fail',
        message:
          err instanceof Error
            ? err.message
            : t('extracted.communities.modQueue.failedToRejectPost_05661041'),
      })
    } finally {
      dispatch({ type: 'stop' })
    }
  }

  async function handleRejectImmediate(postId: string) {
    dispatch({ type: 'start', id: postId })
    try {
      await rejectPost(communitySlug, postId, '')
      dispatch({ type: 'post-resolved', postId })
      dispatch({ type: 'reject-cancelled' })
      clearSelected(`post:${postId}`)
      startTransition(() => {
        refresh()
      })
    } catch (err) {
      dispatch({
        type: 'fail',
        message:
          err instanceof Error
            ? err.message
            : t('extracted.communities.modQueue.failedToRejectPost_05661041'),
      })
    } finally {
      dispatch({ type: 'stop' })
    }
  }

  async function handleResolveReport(
    report: CommunityModerationReport,
    status: 'reviewed' | 'dismissed',
  ) {
    dispatch({ type: 'start', id: report.id })
    try {
      await resolveCommunityModerationReport(communitySlug, report.id, status)
      dispatch({ type: 'report-resolved', reportId: report.id })
      clearSelected(`report:${report.id}`)
    } catch (err) {
      dispatch({
        type: 'fail',
        message:
          err instanceof Error
            ? err.message
            : t('extracted.communities.modQueue.failedToUpdateReport_61bf19b3'),
      })
    } finally {
      dispatch({ type: 'stop' })
    }
  }

  function handleWarnReport(reportId: string) {
    // The backend already resolved the report as 'actioned'; just remove it from the list.
    dispatch({ type: 'report-resolved', reportId })
    clearSelected(`report:${reportId}`)
  }

  function handleBanEvasionAction(reportId: string) {
    dispatch({ type: 'report-resolved', reportId })
    clearSelected(`report:${reportId}`)
  }

  return {
    handleApprove,
    handleBanEvasionAction,
    handleRejectImmediate,
    handleRejectSubmit,
    handleResolveReport,
    handleWarnReport,
  }
}

export type ModQueueItemActions = ReturnType<typeof useModQueueItemActions>
