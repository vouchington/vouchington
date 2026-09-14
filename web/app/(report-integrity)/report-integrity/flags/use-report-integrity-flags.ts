'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getPaginatedQueryKey } from '@/hooks/paginated-query-key'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { useQueryScopedRemovals } from '@/hooks/use-query-scoped-removals'
import {
  applyReportAbusePenalty,
  getReportIntegrityFlagClient,
  resolveReportIntegrityFlag,
} from '@/lib/api/client/report-integrity'
import { getApiErrorMessage } from '@/lib/api/error-helpers'
import { useTranslations } from '@/lib/i18n/use-translations'
import { isAmbiguousIntegrityMutationFailure } from '@/components/admin/use-integrity-penalties'
import { useIntegrityFlagMutationCoordinator } from '@/components/admin/use-integrity-flag-mutation-coordinator'
import { isResolvedIntegrityFlag } from '@/components/admin/integrity-reconciliation'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type {
  FlagResolution,
  ReportIntegrityFlag,
  ReportIntegrityFlagsResponse,
  StatusFilter,
} from '@/types/report-integrity'

export function useReportIntegrityFlags(
  initialData: ReportIntegrityFlagsResponse,
  initialStatus: StatusFilter,
) {
  const router = useRouter()
  const t = useTranslations()
  const [isPending, startTransition] = useTransition()
  const [selectedStatus, setSelectedStatus] = useState(initialStatus)
  const endpoint = '/api/v1/report-integrity/flags'
  const paginationParams = {
    status: initialStatus !== 'all' ? initialStatus : undefined,
  }
  const paginated = usePaginatedList(initialData, endpoint, paginationParams)
  const [resolutions, setResolutions] = useState<Record<string, FlagResolution>>({})
  const [penaltyResults, setPenaltyResults] = useState<Record<string, number>>({})
  const [penaltyConfirm, setPenaltyConfirm] = useState<Record<string, boolean>>({})
  const [flagOverrides, setFlagOverrides] = useState<Record<string, ReportIntegrityFlag>>({})
  const { remove: removeFlag, removedIds } = useQueryScopedRemovals(
    getPaginatedQueryKey(endpoint, paginationParams),
  )

  function applyConfirmedFlag(flag: ReportIntegrityFlag) {
    if (initialStatus === 'pending' && isResolvedIntegrityFlag(flag)) {
      removeFlag(flag.id)
    } else {
      setFlagOverrides(previous => ({ ...previous, [flag.id]: flag }))
    }
  }

  const mutations = useIntegrityFlagMutationCoordinator({
    applyConfirmedFlag,
    canRetryPenaltyAfterReconciliation: flag =>
      flag.resolved_at === null && flag.resolution === null,
    getFlag: (flagId: string) =>
      getReportIntegrityFlagClient<{ flag: ReportIntegrityFlag }>(flagId),
    uncertainMessage: t('extracted.flags.integrityActions.resultUncertain_e24ec07b'),
  })

  function handleStatusChange(status: StatusFilter) {
    setSelectedStatus(status)
    startTransition(() => {
      const query = status === 'pending' ? '' : `?status=${status}`
      router.replace(`/report-integrity/flags${query}`)
    })
  }

  function handleRefreshFlags() {
    startTransition(() => {
      router.refresh()
    })
  }

  async function handleResolve(flagId: string) {
    const resolution = resolutions[flagId]
    if (!resolution || !mutations.acquire(flagId, 'resolve')) return
    try {
      const data = await resolveReportIntegrityFlag<{ flag: ReportIntegrityFlag }>(
        flagId,
        resolution,
      )
      applyConfirmedFlag(data.flag)
    } catch (error) {
      if (isAmbiguousIntegrityMutationFailure(error)) {
        await mutations.reconcile(flagId, 'resolve')
        return
      }
      mutations.fail(
        flagId,
        getApiErrorMessage(error, t('extracted.flags.integrityActions.resolveFailed_bac8e0fb')),
      )
      return
    }
    mutations.release(flagId)
  }

  async function handleApplyPenalty(flagId: string) {
    if (!mutations.acquire(flagId, 'penalty')) return
    try {
      const data = await applyReportAbusePenalty<{
        flag: ReportIntegrityFlag
        penalized_user_count: number
      }>(flagId)
      setPenaltyResults(prev => ({ ...prev, [flagId]: data.penalized_user_count }))
      applyConfirmedFlag(data.flag)
    } catch (error) {
      if (isAmbiguousIntegrityMutationFailure(error)) {
        mutations.preventPenaltyRetry(flagId)
        await mutations.reconcile(flagId, 'penalty')
        return
      }
      mutations.fail(
        flagId,
        getApiErrorMessage(error, t('extracted.flags.integrityActions.investigateFailed_4930e99c')),
      )
      return
    }
    mutations.release(flagId)
  }

  function updateResolution(flagId: string, resolution: FlagResolution) {
    setResolutions(prev => ({ ...prev, [flagId]: resolution }))
  }

  function applyPenaltyWithConfirmation(flagId: string) {
    if (penaltyConfirm[flagId]) {
      setPenaltyConfirm(prev => ({ ...prev, [flagId]: false }))
      void handleApplyPenalty(flagId)
    } else {
      setPenaltyConfirm(prev => ({ ...prev, [flagId]: true }))
    }
  }

  const flags = mergePageResultsById(paginated.pages).reduce<ReportIntegrityFlag[]>(
    (visible, flag) => {
      if (!removedIds.has(flag.id)) visible.push(flagOverrides[flag.id] ?? flag)
      return visible
    },
    [],
  )

  return {
    ...paginated,
    actionErrors: mutations.actionErrors,
    actionError: Object.values(mutations.actionErrors).find(Boolean) ?? null,
    actionLoading: mutations.actionLoading,
    applyPenaltyWithConfirmation,
    flags,
    handleLoadMore: paginated.loadMore,
    handleResolve,
    handleRefreshFlags,
    handleStatusChange,
    penaltyConfirm,
    penaltyResults,
    isPending,
    resolutions,
    selectedStatus,
    reconciliationRequired: mutations.reconciliationRequired,
    retryReconciliation: mutations.retryReconciliation,
    updateResolution,
  }
}

export type ReportIntegrityFlagsState = ReturnType<typeof useReportIntegrityFlags>
