'use client'

import { useCallback, useRef, useState } from 'react'
import type { PageInfo } from '@/types/api-responses'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { IntegrityPenaltyRecord } from './use-integrity-penalties'

export type DuePenalty = IntegrityPenaltyRecord & {
  review_due_at: string
  user_username: string | null
}

export interface AnnualPenaltyReviewsProps<P extends DuePenalty> {
  excludedIds: ReadonlySet<string>
  initialDuePage: { results: P[]; page_info: PageInfo }
  getDue: (options?: {
    after?: string
    limit?: number
  }) => Promise<{ results: P[]; page_info: PageInfo }>
  reconcile: (id: string) => Promise<boolean>
  review: (id: string) => Promise<unknown>
  revoke: (id: string) => Promise<unknown>
}

export function useAnnualPenaltyReviews<P extends DuePenalty>({
  getDue,
  excludedIds,
  initialDuePage,
  revoke,
  reconcile,
}: AnnualPenaltyReviewsProps<P>) {
  const [due, setDue] = useState<P[]>(initialDuePage.results)
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialDuePage.page_info.has_next_page ? initialDuePage.page_info.end_cursor : null,
  )
  const pageCount = useRef(1)
  const [loading, setLoading] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [actionErrorId, setActionErrorId] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<P[] | null> => {
    setLoading(true)
    try {
      const pages = []
      let after: string | undefined
      for (let page = 0; page < pageCount.current; page++) {
        // Reload the pages staff already opened, retaining their review context after a mutation.
        // oxlint-disable-next-line no-await-in-loop -- each opaque continuation comes from the preceding page
        const result = await getDue(after ? { after } : undefined)
        pages.push(result)
        after = result.page_info.has_next_page
          ? (result.page_info.end_cursor ?? undefined)
          : undefined
        if (!after) break
      }
      const results = mergePageResultsById(pages)
      setDue(results)
      setNextCursor(after ?? null)
      setError(false)
      return results
    } catch {
      setError(true)
      return null
    } finally {
      setLoading(false)
    }
  }, [getDue])

  async function applyAction(id: string, action: (id: string) => Promise<unknown>) {
    if (pendingId) return
    setConfirmingRevokeId(null)
    setPendingId(id)
    setActionErrorId(null)
    try {
      await action(id)
      const [reconciled] = await Promise.all([reconcile(id), refresh()])
      if (!reconciled) setActionErrorId(id)
    } catch {
      // The response can be lost after commit. Both authoritative reads can proceed together.
      const [reconciled, currentDue] = await Promise.all([reconcile(id), refresh()])
      if (!reconciled || !currentDue || currentDue.some(penalty => penalty.id === id))
        setActionErrorId(id)
    } finally {
      setPendingId(null)
    }
  }

  async function loadMore() {
    if (!nextCursor || loading) return
    setLoading(true)
    try {
      const result = await getDue({ after: nextCursor })
      setDue(previous => mergePageResultsById([{ results: previous }, result]))
      setNextCursor(result.page_info.has_next_page ? result.page_info.end_cursor : null)
      pageCount.current += 1
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  function revokePenalty(id: string) {
    if (pendingId) return
    if (confirmingRevokeId !== id) {
      setConfirmingRevokeId(id)
      return
    }
    void applyAction(id, revoke)
  }

  return {
    due: due.filter(penalty => !excludedIds.has(penalty.id)),
    nextCursor,
    loading,
    pendingId,
    confirmingRevokeId,
    error,
    actionErrorId,
    refresh,
    applyAction,
    loadMore,
    revokePenalty,
  }
}
