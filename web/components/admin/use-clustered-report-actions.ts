'use client'

import { useState, useTransition, type Dispatch, type SetStateAction } from 'react'
import { useRouter } from 'next/navigation'
import { deletePost } from '@/lib/api/client/post-mutations'
import { resolveModerationReport, rerunReportJudgement } from '@/lib/api/client/reports'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  formatSettledFailure,
  ordinaryResolutionRemovesWholeCluster,
  selectOrdinaryPendingReports,
} from './reports-clustered-actions'
import { addClusterVisibilityKeys, clusterVisibilityKey } from './reports-clustered-state'
import type {
  AdminModerationReport,
  AdminModerationReportCluster,
  AdminModerationReportDuplicateCluster,
} from './reports-client-types'

type ResolveStatus = 'reviewed' | 'dismissed'
type ClusterAction = 'dismiss' | 'remove' | 'review'

export function useClusteredReportActions({
  canBulkRemove,
  clearRerunTimeout,
  isPendingFilter,
  markRerun,
  pendingRerunEntities,
  setRemovedClusterKeys,
  visibleReports,
}: {
  canBulkRemove: boolean
  clearRerunTimeout: () => void
  isPendingFilter: boolean
  markRerun: (reportId: string, runId: string) => void
  pendingRerunEntities: ReadonlySet<string>
  setRemovedClusterKeys: Dispatch<SetStateAction<ReadonlySet<string>>>
  visibleReports: AdminModerationReport[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const [loadingClusterId, setLoadingClusterId] = useState<string | null>(null)
  const [loadingClusterAction, setLoadingClusterAction] = useState<ClusterAction | null>(null)
  const [loadingDuplicateId, setLoadingDuplicateId] = useState<string | null>(null)
  const [rerunningReportId, setRerunningReportId] = useState<string | null>(null)
  const [isRefreshing, startRefreshTransition] = useTransition()

  function handleResolveCluster(cluster: AdminModerationReportCluster, status: ResolveStatus) {
    if (pendingRerunEntities.has(`${cluster.entity_type}:${cluster.entity_id}`)) return
    const pendingReports = selectOrdinaryPendingReports(cluster)
    if (pendingReports.length === 0) return
    setLoadingClusterId(cluster.id)
    setLoadingClusterAction(status === 'reviewed' ? 'review' : 'dismiss')
    startRefreshTransition(async () => {
      try {
        const results = await Promise.allSettled(
          pendingReports.map(report => resolveModerationReport(report.id, status)),
        )
        const failed = results.some(result => result.status === 'rejected')
        if (failed) {
          router.refresh()
          throw formatSettledFailure('Some loaded reports could not be updated', results)
        }
        const resolvedWholeCluster = ordinaryResolutionRemovesWholeCluster(cluster, results)
        if (resolvedWholeCluster) {
          setRemovedClusterKeys(current => new Set(current).add(clusterVisibilityKey(cluster)))
        }
        const statusLabel =
          status === 'reviewed'
            ? t('extracted.admin.reportsClusteredClient.reviewed_e4f934f3')
            : t('extracted.admin.reportsClusteredClient.dismissed_71116847')
        onSuccess(
          `${t('shared.countLabel.format', { count: pendingReports.length, unit: 'loadedReport' })} ${statusLabel}`,
        )
        router.refresh()
      } catch (err) {
        onError(err, {
          fallback: t(
            'extracted.admin.reportsClusteredClient.failedToUpdateReportCluster_aee0929f',
          ),
        })
      } finally {
        setLoadingClusterId(null)
        setLoadingClusterAction(null)
      }
    })
  }

  function handleRemoveClusterTarget(cluster: AdminModerationReportCluster) {
    if (pendingRerunEntities.has(`${cluster.entity_type}:${cluster.entity_id}`)) return
    if (!canBulkRemove || (cluster.entity_type !== 'post' && cluster.entity_type !== 'comment')) {
      return
    }
    setLoadingClusterId(cluster.id)
    setLoadingClusterAction('remove')
    startRefreshTransition(async () => {
      try {
        await deletePost(cluster.entity_id)
        setRemovedClusterKeys(current => new Set(current).add(clusterVisibilityKey(cluster)))
        onSuccess(t('extracted.admin.reportsClusteredClient.targetRemoved_cbaa90e7'))
        router.refresh()
      } catch (err) {
        onError(err, {
          fallback: t('extracted.admin.reportsClusteredClient.failedToRemoveTarget_2a3280c7'),
        })
      } finally {
        setLoadingClusterId(null)
        setLoadingClusterAction(null)
      }
    })
  }

  function handleRemoveDuplicateCluster(duplicate: AdminModerationReportDuplicateCluster) {
    if (!canBulkRemove || !isPendingFilter) return
    if (
      duplicate.clusters.some(cluster =>
        pendingRerunEntities.has(`${cluster.entity_type}:${cluster.entity_id}`),
      )
    )
      return
    const postIds = [...new Set(duplicate.clusters.map(cluster => cluster.entity_id))]
    if (postIds.length === 0) return
    setLoadingDuplicateId(duplicate.id)
    startRefreshTransition(async () => {
      try {
        const results = await Promise.allSettled(postIds.map(postId => deletePost(postId)))
        const failed = results.some(result => result.status === 'rejected')
        if (failed) {
          router.refresh()
          throw formatSettledFailure('Some duplicate posts could not be removed', results)
        }
        setRemovedClusterKeys(current => addClusterVisibilityKeys(current, duplicate.clusters))
        onSuccess(
          `${t('shared.countLabel.format', { count: postIds.length, unit: 'post' })} ${t('extracted.admin.reportsClusteredClient.removed_e1f79758')}`,
        )
        router.refresh()
      } catch (err) {
        onError(err, {
          fallback: t(
            'extracted.admin.reportsClusteredClient.failedToRemoveDuplicateCluster_7e623a38',
          ),
        })
      } finally {
        setLoadingDuplicateId(null)
      }
    })
  }

  function handleRerun(report: AdminModerationReport) {
    if (pendingRerunEntities.has(`${report.entity_type}:${report.entity_id}`)) return
    clearRerunTimeout()
    setRerunningReportId(report.id)
    startRefreshTransition(async () => {
      try {
        const { run_id: runId } = await rerunReportJudgement(report.id)
        markRerun(report.id, runId)
        onSuccess(t('extracted.admin.reportsClusteredClient.judgementReRunQueued_ac6c0160'))
        router.refresh()
      } catch (err) {
        onError(err, {
          fallback: t('extracted.admin.reportsClusteredClient.failedToReRunJudgement_5650de2a'),
        })
      } finally {
        setRerunningReportId(null)
      }
    })
  }

  function handleWarn(report: AdminModerationReport) {
    if (pendingRerunEntities.has(`${report.entity_type}:${report.entity_id}`)) return
    router.refresh()
  }

  function handleBanEvasionAction(reportId: string) {
    const report = visibleReports.find(candidate => candidate.id === reportId)
    if (report && pendingRerunEntities.has(`${report.entity_type}:${report.entity_id}`)) return
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  return {
    handleBanEvasionAction,
    handleRemoveClusterTarget,
    handleRemoveDuplicateCluster,
    handleResolveCluster,
    handleRerun,
    handleWarn,
    isRefreshing,
    loadingClusterAction,
    loadingClusterId,
    loadingDuplicateId,
    rerunningReportId,
  }
}
