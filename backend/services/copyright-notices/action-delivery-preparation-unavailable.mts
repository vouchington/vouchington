import { beginTransaction } from '@data-stores/psql'
import createHttpError from 'http-errors'
import {
  getImagePlacementForCopyright,
  type CopyrightImagePlacement,
} from '@services/images/placements'
import type { CopyrightClaimedActionIntent } from './action-delivery-state.mts'
import type { LockedCopyrightActionDelivery } from './action-delivery-locking-types.mts'
import { hasCopyrightActionBlocker } from './action-delivery-locking.mts'
import { completeUnavailableRestore } from './action-delivery-restore.mts'
import { completeBlockedCopyrightAction } from './action-delivery-withhold.mts'
import {
  beginCopyrightRestorePreparation,
  rollbackCopyrightRestorePreparation,
  commitCopyrightPreparationOutcome,
} from './action-delivery-preparation-admission.mts'

/** Filing-origin authority must remain valid even when its retained placement is unavailable. */
export async function prepareUnavailableCopyrightRestore(input: {
  intent: CopyrightClaimedActionIntent
  legal: LockedCopyrightActionDelivery
  current: CopyrightImagePlacement
  now: Date
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<'applied' | 'blocked' | 'not_claimed'> {
  const legal = await beginCopyrightRestorePreparation(
    input.legal,
    input.intent.id,
    'restoration_unavailable',
    input.query,
  )
  if (!legal) {
    await rollbackCopyrightRestorePreparation(input.query)
    return commitCopyrightPreparationOutcome(input.query, 'not_claimed')
  }
  if (legal.copyright_notice_submission_id) {
    if (await hasCopyrightActionBlocker(legal, input.now, input.query)) {
      await rollbackCopyrightRestorePreparation(input.query)
      return completeBlockedCopyrightAction({
        intentId: input.intent.id,
        leaseToken: input.intent.lease_token,
        legal,
        placement: input.current,
        now: input.now,
        query: input.query,
      })
    }
    const fresh = await getImagePlacementForCopyright(legal.placement_id, { query: input.query })
    if (fresh && !fresh.deleted)
      throw createHttpError(409, 'Placement became available during copyright restoration')
  }
  await completeUnavailableRestore({
    intentId: input.intent.id,
    legal,
    now: input.now,
    query: input.query,
  })
  await input.query.commit()
  return 'applied'
}
