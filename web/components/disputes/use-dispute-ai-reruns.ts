'use client'

import { useState, type Dispatch } from 'react'
import onError from '@/lib/on-error/on-error'
import { usePendingAiRefresh } from '@/hooks/use-pending-ai-refresh'
import { reconcileDisputeAIDraft, rerunDisputeAI } from '@/lib/api/client/disputes'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ReviewDispute } from '@/types/review-disputes'
import type { DisputesClientAction } from './disputes-client-state'

type PendingRerun = { before: ReviewDispute; expiresAt: number }

export function useDisputeAiReruns(
  disputes: ReviewDispute[],
  dispatch: Dispatch<DisputesClientAction>,
) {
  const t = useTranslations()
  const [pendingReruns, setPendingReruns] = useState<ReadonlyMap<string, PendingRerun>>(
    () => new Map(),
  )
  const pendingRerunIds = new Set(pendingReruns.keys())

  function clearPendingRerun(id: string, before: ReviewDispute) {
    setPendingReruns(current => {
      if (current.get(id)?.before !== before) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }

  function applySavedDraft(before: ReviewDispute, saved: ReviewDispute) {
    if (!saved.ai_drafted_at || saved.ai_drafted_at === before.ai_drafted_at) return
    dispatch({ type: 'update_dispute', dispute: saved })
    clearPendingRerun(before.id, before)
  }

  usePendingAiRefresh(pendingRerunIds.size > 0, async () => {
    await Promise.all(
      [...pendingReruns].map(async ([id, { before, expiresAt }]) => {
        if (Date.now() >= expiresAt) {
          clearPendingRerun(id, before)
          onError(new Error('The AI draft is still processing. Refresh to check again.'), {
            fallback: t('extracted.disputes.disputesClient.failedToReRunAi_8c594308'),
            tags: { form: 'dispute-rerun' },
          })
          return
        }
        applySavedDraft(before, await reconcileDisputeAIDraft(before))
      }),
    )
  })

  async function handleRerunAI(id: string) {
    dispatch({ type: 'set_loading', id })
    try {
      const before = disputes.find(dispute => dispute.id === id)
      if (!before) throw new Error(`Could not find dispute ${id}`)
      await rerunDisputeAI(id)
      setPendingReruns(current =>
        new Map(current).set(id, { before, expiresAt: Date.now() + 60_000 }),
      )
      applySavedDraft(before, await reconcileDisputeAIDraft(before))
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
