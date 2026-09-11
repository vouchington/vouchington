import { deleteMyRewardsProgramPointValuation } from '@/lib/api/client'
import onError from '@/lib/on-error'
import { onSuccess } from '@/lib/on-error/on-success'

import type { Dispatch, SetStateAction } from 'react'
import type { Translator } from '@ts-shared/ui-messages'
import type { PointValuation } from '@/types/my'

type StateSetter<T> = Dispatch<SetStateAction<T>>

interface DeletePointValuationOptions {
  activeIds: Set<string>
  failureMessage: string
  id: string
  runWithLoadingId: <T>(id: string, task: () => Promise<T>) => Promise<T>
  setDeletedIds: StateSetter<Set<string>>
  setUpserts: StateSetter<Map<string, PointValuation>>
  successMessage: string
  valuation: PointValuation | undefined
}

async function deletePointValuationOptimistically({
  failureMessage,
  id,
  runWithLoadingId,
  setDeletedIds,
  setUpserts,
  successMessage,
  valuation,
}: DeletePointValuationOptions) {
  setDeletedIds(previous => new Set(previous).add(id))
  try {
    await runWithLoadingId(id, async () => {
      await deleteMyRewardsProgramPointValuation(id)
      setUpserts(previous => {
        const next = new Map(previous)
        next.delete(id)
        return next
      })
      onSuccess(successMessage)
    })
  } catch (error) {
    setDeletedIds(previous => {
      const next = new Set(previous)
      next.delete(id)
      return next
    })
    if (valuation) {
      setUpserts(previous => new Map(previous).set(id, valuation))
    }
    onError(error, { fallback: failureMessage })
  }
}

type DeletePointValuationHandlerOptions = Omit<
  DeletePointValuationOptions,
  'failureMessage' | 'successMessage' | 'valuation'
> & {
  translate: Translator
  valuations: PointValuation[]
}

export async function deletePointValuationWithMutationGuard(
  options: DeletePointValuationHandlerOptions,
) {
  if (options.activeIds.has(options.id)) return
  options.activeIds.add(options.id)
  try {
    await deletePointValuationOptimistically({
      ...options,
      failureMessage: options.translate(
        'extracted.my.pointValuationsManager.failedToRemovePointValuation_b4baf3fe',
      ),
      successMessage: options.translate(
        'extracted.my.pointValuationsManager.pointValuationRemoved_e0ce6b55',
      ),
      valuation: options.valuations.find(valuation => valuation.id === options.id),
    })
  } finally {
    options.activeIds.delete(options.id)
  }
}
