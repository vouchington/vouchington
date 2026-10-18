'use client'

import { useState, type Dispatch } from 'react'
import onError from '@/lib/on-error/on-error'
import { usePendingAiRefresh } from '@/hooks/use-pending-ai-refresh'
import { reconcileDisputeAIDraft, rerunDisputeAI } from '@/lib/api/client/disputes'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ReviewDispute } from '@/types/review-disputes'
import type { DisputesClientAction } from './disputes-client-state'

type PendingRerun = { before: ReviewDispute; runId: string; expiresAt: number }

export function useDisputeAiReruns(
  disputes: ReviewDispute[],
  dispatch: Dispatch<DisputesClientAction>,
) {
  const t = useTranslations()
  const [pendingReruns, setPendingReruns] = useState<ReadonlyMap<string, PendingRerun>>(
    () => new Map(),
  )
  const pendingRerunIds = new Set(pendingReruns.keys())

  function clearPendingRerun(id: string, runId: string) {
    setPendingReruns(current => {
      if (current.get(id)?.runId !== runId) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }

  function applySavedDraft(before: ReviewDispute, runId: string, saved: ReviewDispute) {
    const requestedRunId = saved.ai_draft_requested_run_id
    // A newer staff request may supersede ours. Only the current server request
    // completing is terminal; staff approval, delivery, or resolution also ends AI drafting.
    if (
      !saved.approved_at &&
      !saved.sent_at &&
      !saved.resolved_at &&
      (!requestedRunId || saved.ai_draft_run_id !== requestedRunId)
    )
      return
    dispatch({ type: 'update_dispute', dispute: saved })
    clearPendingRerun(before.id, runId)
  }

  usePendingAiRefresh(
    pendingRerunIds.size > 0,
    async () => {
      await Promise.all(
        [...pendingReruns].map(async ([id, { before, runId, expiresAt }]) => {
          if (Date.now() >= expiresAt) {
            clearPendingRerun(id, runId)
            onError(new Error('The AI draft is still processing. Refresh to check again.'), {
              fallback: t('extracted.disputes.disputesClient.failedToReRunAi_8c594308'),
              tags: { form: 'dispute-rerun' },
            })
            return
          }
          applySavedDraft(before, runId, await reconcileDisputeAIDraft(before))
        }),
      )
    },
    [...pendingReruns].map(([id, { expiresAt }]) => `${id}:${expiresAt}`).join('|'),
    expiredKeys => {
      const expiredSet = new Set(expiredKeys)
      setPendingReruns(
        current =>
          new Map(
            [...current].filter(([id, rerun]) => !expiredSet.has(`${id}:${rerun.expiresAt}`)),
          ),
      )
      onError(new Error('The AI draft is still processing. Refresh to check again.'), {
        fallback: t('extracted.disputes.disputesClient.failedToReRunAi_8c594308'),
        tags: { form: 'dispute-rerun' },
      })
    },
  )

  async function handleRerunAI(id: string) {
    dispatch({ type: 'set_loading', id })
    try {
      const before = disputes.find(dispute => dispute.id === id)
      if (!before) throw new Error(`Could not find dispute ${id}`)
      const { run_id: runId } = await rerunDisputeAI(id)
      setPendingReruns(current =>
        new Map(current).set(id, { before, runId, expiresAt: Date.now() + 60_000 }),
      )
      try {
        applySavedDraft(before, runId, await reconcileDisputeAIDraft(before))
      } catch (err) {
        // Admission succeeded; the installed pending rerun will retry the primary read.
        console.error('Could not refresh queued dispute draft', err)
      }
    } catch (err) {
      onError(err, {
        fallback: t('extracted.disputes.disputesClient.failedToReRunAi_8c594308'),
        tags: { form: 'dispute-rerun' },
      })
    } finally {
      dispatch({ type: 'set_loading', id: null })
    }
  }

  return { handleRerunAI, pendingRerunIds }
}
