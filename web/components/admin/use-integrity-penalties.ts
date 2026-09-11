'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/api/error'
import { getApiErrorMessage } from '@/lib/api/error-helpers'
import { getPaginatedQueryKey } from '@/hooks/paginated-query-key'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { useQueryScopedRemovals } from '@/hooks/use-query-scoped-removals'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { PageInfo } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import { isRevokedIntegrityPenalty } from './integrity-reconciliation'

export type IntegrityPenaltyStatus = 'active' | 'revoked' | 'all'

export interface IntegrityPenaltyRecord {
  id: string
  user_id: string
  reason: string
  source_flag_id: string | null
  created_by_id: string | null
  revoked_at: string | null
  revoked_by_id: string | null
  created_at: string
}

export interface IntegrityPenaltyPage<P extends IntegrityPenaltyRecord> {
  results: P[]
  page_info: PageInfo
}

interface IntegrityPenaltyHookOptions<P extends IntegrityPenaltyRecord> {
  endpoint: string
  initialData: IntegrityPenaltyPage<P>
  initialStatus: IntegrityPenaltyStatus
  listPath: string
  paginationParams?: Record<string, string>
  available?: boolean
  getById: (id: string) => Promise<{ penalty: P }>
  revoke: (id: string) => Promise<{ penalty: P }>
  scopeGuard?: (page: IntegrityPenaltyPage<P>) => boolean
}

export function isAmbiguousIntegrityMutationFailure(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 408 || error.status >= 500
}

function isNotFoundIntegrityPenalty(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

export function useIntegrityPenalties<P extends IntegrityPenaltyRecord>(
  options: IntegrityPenaltyHookOptions<P>,
) {
  const router = useRouter()
  const t = useTranslations()
  const [isPending, startTransition] = useTransition()
  const [selectedStatus, setSelectedStatus] = useState(options.initialStatus)
  const statusParam = options.initialStatus === 'all' ? undefined : options.initialStatus
  const paginationParams = {
    ...options.paginationParams,
    status: statusParam,
  }
  const paginated = usePaginatedList(options.initialData, options.endpoint, paginationParams)
  const actionLocks = useRef(new Set<string>())
  const [confirming, setConfirming] = useState<Record<string, boolean>>({})
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [reconciliationRequired, setReconciliationRequired] = useState<Record<string, boolean>>({})
  const [overrides, setOverrides] = useState<Record<string, P>>({})
  const { remove: removePenalty, removedIds } = useQueryScopedRemovals(
    getPaginatedQueryKey(options.endpoint, paginationParams),
  )
  const scopeAvailable =
    options.available !== false &&
    (options.scopeGuard ? paginated.pages.every(page => options.scopeGuard!(page)) : true)

  function handleStatusChange(status: IntegrityPenaltyStatus) {
    setSelectedStatus(status)
    startTransition(() => {
      const query = status === 'active' ? '' : `?status=${status}`
      router.replace(`${options.listPath}${query}`)
    })
  }

  function handleRefresh() {
    startTransition(() => router.refresh())
  }

  function releaseLock(id: string) {
    actionLocks.current.delete(id)
  }

  function completeReconciliation(id: string) {
    setReconciliationRequired(previous => ({ ...previous, [id]: false }))
    setActionErrors(previous => ({ ...previous, [id]: '' }))
    setActionLoading(previous => ({ ...previous, [id]: false }))
    releaseLock(id)
  }

  function applyConfirmedPenalty(penalty: P) {
    if (options.initialStatus === 'active' && isRevokedIntegrityPenalty(penalty)) {
      removePenalty(penalty.id)
      return
    }
    setOverrides(previous => ({ ...previous, [penalty.id]: penalty }))
  }

  async function reconcile(id: string): Promise<boolean> {
    try {
      const { penalty } = await options.getById(id)
      applyConfirmedPenalty(penalty)
      completeReconciliation(id)
      return true
    } catch (error) {
      if (isNotFoundIntegrityPenalty(error)) {
        removePenalty(id)
        completeReconciliation(id)
        return true
      }
      setActionErrors(previous => ({
        ...previous,
        [id]: getApiErrorMessage(
          error,
          t('extracted.flags.integrityPenalties.reloadFailed_a52df981'),
        ),
      }))
      return false
    }
  }

  async function revokeWithConfirmation(id: string) {
    if (!scopeAvailable) return
    if (!confirming[id]) {
      setConfirming(previous => ({ ...previous, [id]: true }))
      return
    }
    if (actionLocks.current.has(id)) return
    actionLocks.current.add(id)
    setActionLoading(previous => ({ ...previous, [id]: true }))
    setConfirming(previous => ({ ...previous, [id]: false }))
    setActionErrors(previous => ({ ...previous, [id]: '' }))
    try {
      const response = await options.revoke(id)
      applyConfirmedPenalty(response.penalty)
      setActionLoading(previous => ({ ...previous, [id]: false }))
      releaseLock(id)
    } catch (error) {
      if (isAmbiguousIntegrityMutationFailure(error) || isNotFoundIntegrityPenalty(error)) {
        setReconciliationRequired(previous => ({ ...previous, [id]: true }))
        setActionErrors(previous => ({
          ...previous,
          [id]: t('extracted.flags.integrityPenalties.resultUncertain_e24ec07b'),
        }))
        await reconcile(id)
      } else {
        setActionErrors(previous => ({
          ...previous,
          [id]: getApiErrorMessage(
            error,
            t('extracted.flags.integrityPenalties.revokeFailed_c719e9c2'),
          ),
        }))
        setActionLoading(previous => ({ ...previous, [id]: false }))
        releaseLock(id)
      }
    }
  }

  const penalties = scopeAvailable
    ? mergePageResultsById(paginated.pages).reduce<P[]>((visible, penalty) => {
        if (!removedIds.has(penalty.id)) visible.push(overrides[penalty.id] ?? penalty)
        return visible
      }, [])
    : []

  return {
    ...paginated,
    actionErrors,
    actionLoading,
    confirming,
    handleRefresh,
    handleStatusChange,
    isPending,
    penalties,
    reconcile,
    reconciliationRequired,
    revokeWithConfirmation,
    scopeAvailable,
    selectedStatus,
  }
}

export type IntegrityPenaltiesState<P extends IntegrityPenaltyRecord> = ReturnType<
  typeof useIntegrityPenalties<P>
>
