import { beginTransaction } from '@data-stores/psql'
import { invalidateCopyrightLegalRemovalSurfaces } from './action-delivery-cache.mts'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'
import {
  completeCopyrightActionIntentInTransaction,
  lockCopyrightActionDelivery,
} from './action-delivery-state.mts'

/**
 * Denies a restored placement tuple and records the intent outcome in three ordered steps:
 * the denial commits in the caller's intent-locked transaction, legal-removal surfaces are
 * evicted once that projection change is visible, and a second lease-fenced transaction
 * commits the outcome as the eviction receipt. A failed eviction leaves the intent claimed,
 * so compensation or lease recovery retries it.
 */
export async function denyRestoreThenComplete(input: {
  intentId: string
  leaseToken: string
  tuple: { placementId: string; revision: number; imageId: string }
  outcome: 'blocked' | 'stale'
  completedAt: Date
  failureMessage: string
  transaction: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<'completed' | 'not_claimed'> {
  await prepublishCopyrightImagePlacementDenial({ ...input.tuple }, { query: input.transaction })
  await input.transaction.commit()
  await using receipt = await beginTransaction()
  const legal = await lockCopyrightActionDelivery(input.intentId, input.leaseToken, receipt)
  if (!legal) {
    await receipt.commit()
    return 'not_claimed'
  }
  await invalidateCopyrightLegalRemovalSurfaces(
    { placement_id: input.tuple.placementId, action: 'withhold' },
    receipt,
  )
  await completeCopyrightActionIntentInTransaction({
    intentId: input.intentId,
    leaseToken: input.leaseToken,
    outcome: input.outcome,
    completedAt: input.completedAt,
    failureMessage: input.failureMessage,
    query: receipt,
  })
  await receipt.commit()
  return 'completed'
}
