'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getPaginatedQueryKey } from '@/hooks/paginated-query-key'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { useQueryScopedRemovals } from '@/hooks/use-query-scoped-removals'
import {
  applyVoteRingPenalty,
  getVoteIntegrityFlagClient,
  resolveVoteIntegrityFlag,
} from '@/lib/api/client/vote-integrity'
import { getApiErrorMessage } from '@/lib/api/error-helpers'
import { useTranslations } from '@/lib/i18n/use-translations'
import { isAmbiguousIntegrityMutationFailure } from '@/components/admin/use-integrity-penalties'
import { useIntegrityFlagMutationCoordinator } from '@/components/admin/use-integrity-flag-mutation-coordinator'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import { getExactVotePenaltyIds } from './vote-penalty-snapshot'
import {
  hasNewIntegrityPenalty,
  isResolvedIntegrityFlag,
} from '@/components/admin/integrity-reconciliation'
import type {
  FlagResolution,
  StatusFilter,
  VoteIntegrityFlag,
  VoteIntegrityFlagsResponse,
} from '@/types/vote-integrity'

export function useVoteIntegrityFlags(
  initialData: VoteIntegrityFlagsResponse,
  initialStatus: StatusFilter,
) {
  const router = useRouter()
  const t = useTranslations()
  const [isPending, startTransition] = useTransition()
  const [selectedStatus, setSelectedStatus] = useState(initialStatus)
  const endpoint = '/api/v1/vote-integrity/flags'
  const paginationParams = {
    status: initialStatus !== 'all' ? initialStatus : undefined,
  }
  const paginated = usePaginatedList(initialData, endpoint, paginationParams)
  const [resolutions, setResolutions] = useState<Record<string, FlagResolution>>({})
  const [penaltyApplied, setPenaltyApplied] = useState<Record<string, boolean>>({})
  const [penaltyResults, setPenaltyResults] = useState<Record<string, number>>({})
  const [penaltyConfirm, setPenaltyConfirm] = useState<Record<string, boolean>>({})
  const [flagOverrides, setFlagOverrides] = useState<Record<string, VoteIntegrityFlag>>({})
  const { remove: removeFlag, removedIds } = useQueryScopedRemovals(
    getPaginatedQueryKey(endpoint, paginationParams),
  )
  const penaltyBaselineIds = useRef(new Map<string, ReadonlySet<string>>())

  function applyConfirmedFlag(flag: VoteIntegrityFlag) {
    if (initialStatus === 'pending' && isResolvedIntegrityFlag(flag)) {
      removeFlag(flag.id)
    } else {
      setFlagOverrides(previous => ({ ...previous, [flag.id]: flag }))
    }
  }

  const mutations = useIntegrityFlagMutationCoordinator({
    applyConfirmedFlag,
    canRetryPenaltyAfterReconciliation: async (_flag, flagId) => {
      const baseline = penaltyBaselineIds.current.get(flagId)
      if (!baseline) throw new Error('Vote penalty reconciliation is missing its baseline')
      const currentPenaltyIds = await getExactVotePenaltyIds(flagId)
      penaltyBaselineIds.current.delete(flagId)
      const penaltyWasApplied = hasNewIntegrityPenalty(baseline, currentPenaltyIds)
      if (penaltyWasApplied) {
        setPenaltyApplied(previous => ({ ...previous, [flagId]: true }))
      }
      return !penaltyWasApplied
    },
    getFlag: (flagId: string) => getVoteIntegrityFlagClient<{ flag: VoteIntegrityFlag }>(flagId),
    uncertainMessage: t('extracted.flags.integrityActions.resultUncertain_e24ec07b'),
  })

  function handleStatusChange(status: StatusFilter) {
    setSelectedStatus(status)
    startTransition(() => {
      const query = status === 'pending' ? '' : `?status=${status}`
      router.replace(`/vote-integrity/flags${query}`)
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
      const data = await resolveVoteIntegrityFlag<{ flag: VoteIntegrityFlag }>(flagId, resolution)
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
      penaltyBaselineIds.current.set(flagId, await getExactVotePenaltyIds(flagId))
    } catch (error) {
      penaltyBaselineIds.current.delete(flagId)
      mutations.fail(
        flagId,
        getApiErrorMessage(error, t('extracted.flags.integrityActions.penaltyFailed_2a87b1f6')),
      )
      return
    }
    let data: { penalized_user_count: number }
    try {
      data = await applyVoteRingPenalty<{ penalized_user_count: number }>(flagId)
    } catch (error) {
      if (isAmbiguousIntegrityMutationFailure(error)) {
        mutations.preventPenaltyRetry(flagId)
        await mutations.reconcile(flagId, 'penalty')
        return
      }
      penaltyBaselineIds.current.delete(flagId)
      mutations.fail(
        flagId,
        getApiErrorMessage(error, t('extracted.flags.integrityActions.penaltyFailed_2a87b1f6')),
      )
      return
    }
    mutations.preventPenaltyRetry(flagId)
    penaltyBaselineIds.current.delete(flagId)
    setPenaltyResults(previous => ({ ...previous, [flagId]: data.penalized_user_count }))
    try {
      const { flag } = await getVoteIntegrityFlagClient<{ flag: VoteIntegrityFlag }>(flagId)
      applyConfirmedFlag(flag)
      mutations.release(flagId)
    } catch {
      mutations.requireReconciliation(flagId, 'penalty-confirmation')
    }
  }

  function updateResolution(flagId: string, resolution: FlagResolution) {
    setResolutions(prev => ({ ...prev, [flagId]: resolution }))
  }

  function applyPenaltyWithConfirmation(flagId: string) {
    if (penaltyConfirm[flagId]) {
      setPenaltyConfirm(prev => ({ ...prev, [flagId]: false }))
      handleApplyPenalty(flagId).catch(() => {})
    } else {
      setPenaltyConfirm(prev => ({ ...prev, [flagId]: true }))
    }
  }

  const flags = mergePageResultsById(paginated.pages).reduce<VoteIntegrityFlag[]>(
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
    isPending,
    penaltyApplied,
    penaltyConfirm,
    penaltyResults,
    resolutions,
    selectedStatus,
    reconciliationRequired: mutations.reconciliationRequired,
    retryReconciliation: mutations.retryReconciliation,
    updateResolution,
  }
}

export type VoteIntegrityFlagsState = ReturnType<typeof useVoteIntegrityFlags>
