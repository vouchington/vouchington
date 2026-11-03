'use client'

import type { Dispatch } from 'react'
import onError from '@/lib/on-error/on-error'
import {
  approveDispute,
  dismissDispute,
  getReviewDisputeClient,
  resolveDisputeAnnotate,
  resolveDisputeRemove,
  sendDisputeResolution,
  updateDisputeDraft,
} from '@/lib/api/client/disputes'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ReviewDispute } from '@/types/review-disputes'
import type { DisputesClientAction, DisputesClientState } from './disputes-client-state'

/** Staff actions on one dispute; each returns the full dispute and replaces the row's override. */
export function useDisputeActions(
  state: DisputesClientState,
  dispatch: Dispatch<DisputesClientAction>,
) {
  const t = useTranslations()

  async function run(
    id: string,
    tag: string,
    fallback: string,
    action: () => Promise<{ dispute: ReviewDispute }>,
  ) {
    dispatch({ type: 'set_loading', id })
    try {
      const result = await action()
      dispatch({ type: 'update_dispute', dispute: result.dispute })
    } catch (err) {
      onError(err, { fallback, tags: { form: tag } })
    } finally {
      dispatch({ type: 'set_loading', id: null })
    }
  }

  async function handleOpen(id: string) {
    dispatch({ type: 'set_loading', id })
    try {
      dispatch({ type: 'open_dispute', dispute: await getReviewDisputeClient(id) })
    } catch (err) {
      onError(err, {
        fallback: t('extracted.disputes.disputesClient.failedToLoad_9cbf78a2'),
        tags: { form: 'dispute-open' },
      })
    } finally {
      dispatch({ type: 'set_loading', id: null })
    }
  }

  const handleApprove = (id: string) =>
    run(
      id,
      'dispute-approve',
      t('extracted.disputes.disputesClient.failedToApproveDispute_c4b95406'),
      () => approveDispute(id),
    )

  const handleSend = (id: string) =>
    run(
      id,
      'dispute-send',
      t('extracted.disputes.disputesClient.failedToSendDisputeResolution_7cdfc475'),
      () => sendDisputeResolution(id),
    )

  const handleResolve = (id: string, action: 'remove' | 'dismiss') =>
    run(
      id,
      'dispute-resolve',
      t('extracted.disputes.disputesClient.failedToResolveDispute_ed6dde5c'),
      () => (action === 'dismiss' ? dismissDispute(id) : resolveDisputeRemove(id, action)),
    )

  const handleAnnotate = (id: string, text: string) =>
    run(
      id,
      'dispute-annotate',
      t('extracted.disputes.disputesClient.failedToAttachAnnotation_4e848bc5'),
      () => resolveDisputeAnnotate(id, text),
    )

  async function handleSaveAndApprove(id: string) {
    const text = state.draftEdits[id]
    if (text !== undefined) {
      try {
        await updateDisputeDraft(id, { public_response: text })
      } catch (err) {
        // Do not approve a stale draft if saving the edits failed.
        onError(err, {
          fallback: t('extracted.disputes.disputesClient.failedToSaveDraft_350705d0'),
        })
        return
      }
    }
    await handleApprove(id)
  }

  return {
    handleOpen,
    handleSend,
    handleResolve,
    handleAnnotate,
    handleSaveAndApprove,
  }
}
