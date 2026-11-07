'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ModerationBulkAction } from '@/components/moderation/bulk-action-toolbar'
import onError, { onSuccess } from '@/lib/on-error'
import {
  resolveModerationReport,
  rerunReportJudgement,
  type ModerationReportSortParam,
  type StaffFlatModerationReportsResponse,
} from '@/lib/api/client/reports'
import { useTranslations } from '@/lib/i18n/use-translations'
import { isReportRerunPending } from './report-action-eligibility'
import { runFlatReportsBulk } from './flat-reports-bulk'
import type { AdminModerationReport, MemberModerationReportsResponse } from './reports-client-types'
import { useReportsAiPolling } from './use-reports-ai-polling'

type ResolveStatus = 'reviewed' | 'dismissed'

export type FlatReportsClientProps = (
  | { viewerTier: 'staff'; data: StaffFlatModerationReportsResponse }
  | { viewerTier: 'member'; data: MemberModerationReportsResponse }
) & {
  canBulkRemove: boolean
  statusFilter?: string
  sortOrder?: ModerationReportSortParam
  currentAfter?: string
  clusterMode?: 'entity' | 'none'
}

export function useFlatReportsState({ canBulkRemove, data, viewerTier }: FlatReportsClientProps) {
  const t = useTranslations()
  const router = useRouter()
  const [resolvedIds, setResolvedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [rerunningId, setRerunningId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [bulkAction, setBulkAction] = useState<ModerationBulkAction | null>(null)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [isRefreshing, startRefreshTransition] = useTransition()
  const reports = useMemo(
    () => data.results.filter(report => !resolvedIds.has(report.id)),
    [data.results, resolvedIds],
  )
  const { pendingRerunEntities, pollingTimedOut, rerunTimedOut, clearRerunTimeout, markRerun } =
    useReportsAiPolling(
      viewerTier === 'staff' ? (reports as AdminModerationReport[]) : [],
      viewerTier === 'staff',
    )

  async function handleResolve(reportId: string, status: ResolveStatus) {
    if (rerunPending(reportId)) return
    // Disable all rows while one resolve is in flight (prevents concurrent double-submits).
    setLoadingId(reportId)
    try {
      await resolveModerationReport(reportId, status)
      // The resolved row unmounts (filtered out); clearing loadingId re-enables the
      // remaining rows. The submitted row never re-enables because it is removed.
      setResolvedIds(current => new Set(current).add(reportId))
      clearSelected(reportId)
    } catch (err) {
      onError(err, {
        fallback: t('extracted.admin.reportsClient.failedToUpdateReport_61bf19b3'),
        tags: { form: 'moderation-resolve' },
      })
    } finally {
      setLoadingId(null)
    }
  }

  function handleWarn(reportId: string) {
    if (rerunPending(reportId)) return
    // The backend already resolved the report as 'actioned'; just remove it from the list.
    setResolvedIds(current => new Set(current).add(reportId))
  }

  function handleBanEvasionAction(reportId: string) {
    if (rerunPending(reportId)) return
    setResolvedIds(current => new Set(current).add(reportId))
  }

  function rerunPending(reportId: string): boolean {
    return isReportRerunPending(reportId, reports as AdminModerationReport[], pendingRerunEntities)
  }

  function handleRerun(reportId: string) {
    if (rerunPending(reportId)) return
    clearRerunTimeout()
    setRerunningId(reportId)
    // Wrap the entire async sequence so controls stay disabled until both the POST
    // and the follow-up router.refresh() transition complete (web/AGENTS.md rule 29).
    startRefreshTransition(async () => {
      try {
        const { run_id: runId } = await rerunReportJudgement(reportId)
        markRerun(reportId, runId)
        onSuccess(t('extracted.admin.reportsClient.judgementReRunQueued_ac6c0160'))
        // Note: because the rerun is async (202), the new judgement may not be
        // immediately visible until the background worker completes.
        router.refresh()
      } catch (err) {
        onError(err, {
          fallback: t('extracted.admin.reportsClient.failedToReRunJudgement_5650de2a'),
          tags: { form: 'moderation-rerun' },
        })
      } finally {
        setRerunningId(null)
      }
    })
  }

  function toggleSelected(reportId: string) {
    if (viewerTier !== 'staff' || bulkLoading) return
    setBulkMessage(null)
    setSelectedIds(current => {
      if (rerunPending(reportId) && !current.has(reportId)) return current
      const next = new Set(current)
      if (next.has(reportId)) next.delete(reportId)
      else next.add(reportId)
      return next
    })
  }

  function clearSelected(reportId: string) {
    setSelectedIds(current => {
      if (!current.has(reportId)) return current
      const next = new Set(current)
      next.delete(reportId)
      return next
    })
  }

  function handleBulkConfirm(action: ModerationBulkAction) {
    return runFlatReportsBulk({
      action,
      canBulkRemove,
      pendingRerunEntities,
      refresh: () => router.refresh(),
      reports,
      selectedIds,
      setBulkAction,
      setBulkLoading,
      setBulkMessage,
      setResolvedIds,
      setSelectedIds,
      viewerTier,
    })
  }

  return {
    bulkAction,
    bulkLoading,
    bulkMessage,
    handleBanEvasionAction,
    handleBulkConfirm,
    handleRerun,
    handleResolve,
    handleWarn,
    isRefreshing,
    loadingId,
    pendingRerunEntities,
    pollingTimedOut,
    reports,
    rerunTimedOut,
    rerunningId,
    selectedIds,
    setBulkAction,
    setBulkMessage,
    setSelectedIds,
    toggleSelected,
  }
}
