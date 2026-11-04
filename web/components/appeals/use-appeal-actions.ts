'use client'

import { useRef, type Dispatch } from 'react'
import onError from '@/lib/on-error/on-error'
import { useLoadingIds } from '@/hooks/use-loading-ids'
import {
  approveAppeal,
  sendAppealResolution,
  updateAppealDraft,
  resolveAppeal,
  enqueueAppealAIDraftRerun,
  reconcileAppealAIDraft,
  getModerationAppealClient,
  AppealDraftReconciliationTimeoutError,
} from '@/lib/api/client/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ModerationAppeal, ModerationAppealAction } from '@/types/appeals'
import { appealsClientReducer } from './appeals-client-state'

type State = ReturnType<typeof appealsClientReducer>
type Action = Parameters<typeof appealsClientReducer>[1]

/** Staff actions on one appeal; each returns the full appeal and replaces the row's override. */
export function useAppealActions(state: State, dispatch: Dispatch<Action>) {
  const t = useTranslations()
  const { loadingIds, runWithLoadingId } = useLoadingIds()
  const rerunEnqueuesRef = useRef(new Map<string, ReturnType<typeof enqueueAppealAIDraftRerun>>())

  async function run(
    id: string,
    tag: string,
    fallback: string,
    action: () => Promise<{ appeal: ModerationAppeal }>,
  ) {
    await runWithLoadingId(id, async () => {
      try {
        dispatch({ type: 'update_appeal', appeal: (await action()).appeal })
      } catch (err) {
        onError(err, { fallback, tags: { form: tag } })
      }
    })
  }

  async function handleOpen(id: string) {
    await runWithLoadingId(id, async () => {
      try {
        dispatch({ type: 'open_appeal', appeal: await getModerationAppealClient(id) })
      } catch (err) {
        onError(err, {
          fallback: t('extracted.appeals.appealsClient.failedToLoad_9cbf78a2'),
          tags: { form: 'appeal-open' },
        })
      }
    })
  }

  const handleApprove = (id: string) =>
    run(
      id,
      'appeal-approve',
      t('extracted.appeals.appealsClient.failedToApproveAppeal_b5452349'),
      () => approveAppeal(id),
    )

  const handleSend = (id: string) =>
    run(
      id,
      'appeal-send',
      t('extracted.appeals.appealsClient.failedToSendAppealResolution_87938c2e'),
      () => sendAppealResolution(id),
    )

  const handleResolve = (id: string, action: ModerationAppealAction) =>
    run(
      id,
      'appeal-resolve',
      t('extracted.appeals.appealsClient.failedToResolveAppeal_162e0dc1'),
      () => resolveAppeal(id, action),
    )

  async function handleRerunAI(id: string) {
    await runWithLoadingId(id, async () => {
      try {
        const appeal = state.appealOverrides[id]
        if (!appeal) throw new Error(`Could not find appeal ${id}`)
        let enqueue = rerunEnqueuesRef.current.get(id)
        if (!enqueue) {
          enqueue = enqueueAppealAIDraftRerun(id)
          rerunEnqueuesRef.current.set(id, enqueue)
        }
        try {
          await enqueue
        } catch (err) {
          rerunEnqueuesRef.current.delete(id)
          throw err
        }
        let result: Awaited<ReturnType<typeof reconcileAppealAIDraft>>
        try {
          result = await reconcileAppealAIDraft(appeal)
        } catch (err) {
          if (err instanceof AppealDraftReconciliationTimeoutError) {
            rerunEnqueuesRef.current.delete(id)
          }
          throw err
        }
        rerunEnqueuesRef.current.delete(id)
        dispatch({ type: 'reconcile_rerun_appeal', appeal: result.appeal })
      } catch (err) {
        onError(err, {
          fallback: t('extracted.appeals.appealsClient.failedToReRunAi_8c594308'),
          tags: { form: 'appeal-rerun' },
        })
      }
    })
  }

  async function handleSaveAndApprove(id: string) {
    const text = state.draftEdits[id]
    if (text !== undefined) {
      try {
        await updateAppealDraft(id, { public_response: text })
      } catch (err) {
        onError(err, {
          fallback: t('extracted.appeals.appealsClient.failedToSaveDraft_350705d0'),
        })
        return
      }
    }
    await handleApprove(id)
  }

  return {
    loadingIds,
    handleOpen,
    handleSend,
    handleResolve,
    handleRerunAI,
    handleSaveAndApprove,
  }
}
