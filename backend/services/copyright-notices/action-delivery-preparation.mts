import { prepareUnavailableCopyrightRestore } from './action-delivery-preparation-unavailable.mts'
import {
  beginCopyrightRestorePreparation,
  withCopyrightPreparationTransaction,
  commitCopyrightPreparationOutcome,
  rollbackCopyrightRestorePreparation,
} from './action-delivery-preparation-admission.mts'
import { readCopyrightActionPreparation } from './action-delivery-preparation-facts.mts'
import { assertMediaDeliveryLegalEnforcementEnabled } from '@modules/aws'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { stageImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import {
  completeCopyrightActionIntentInTransaction,
  hasCopyrightActionBlocker,
  type CopyrightClaimedActionIntent,
} from './action-delivery-state.mts'
import {
  authorizeRestoreBeforeDelivery,
  retainRestoreWhenOtherRestrictionsActive,
} from './action-delivery-restore.mts'
import {
  isCurrentPlacementForIntent,
  mutateCopyrightPlacement,
} from './action-delivery-mutation.mts'
import {
  prepublishWithholdIfNeeded,
  completeBlockedCopyrightAction,
  completeLiftedCopyrightWithhold,
} from './action-delivery-withhold.mts'

export async function prepareCopyrightAction(intent: CopyrightClaimedActionIntent, now: Date) {
  return withCopyrightPreparationTransaction(
    async transaction => {
      let legal = await readCopyrightActionPreparation(intent.id, intent.lease_token, transaction)
      if (!legal) return commitCopyrightPreparationOutcome(transaction, 'not_claimed')
      if (legal.action === 'withhold' && legal.restriction_lifted_at !== null)
        return completeLiftedCopyrightWithhold({
          intentId: intent.id,
          legal,
          now,
          query: transaction,
        })
      let current = await getImagePlacementForCopyright(legal.placement_id, {
        query: transaction,
      })
      if (legal.action === 'restore' && current?.deleted) {
        return prepareUnavailableCopyrightRestore({
          intent,
          legal,
          current,
          now,
          query: transaction,
        })
      }
      if (!isCurrentPlacementForIntent(current, legal)) {
        await completeCopyrightActionIntentInTransaction({
          intentId: intent.id,
          leaseToken: intent.lease_token,
          outcome: 'stale',
          completedAt: now,
          failureMessage:
            'Authoritative placement no longer matches the intent revision and asset.',
          query: transaction,
        })
        return commitCopyrightPreparationOutcome(transaction, 'stale')
      }
      assertMediaDeliveryLegalEnforcementEnabled()
      if (await hasCopyrightActionBlocker(legal, now, transaction)) {
        return completeBlockedCopyrightAction({
          intentId: intent.id,
          leaseToken: intent.lease_token,
          legal,
          placement: current,
          now,
          query: transaction,
        })
      }
      if (legal.action === 'withhold')
        await prepublishWithholdIfNeeded({ legal, placement: current, query: transaction })
      if (
        legal.action === 'restore' &&
        (await retainRestoreWhenOtherRestrictionsActive({
          intentId: intent.id,
          legal,
          now,
          query: transaction,
        }))
      )
        return commitCopyrightPreparationOutcome(transaction, 'applied')
      if (legal.action === 'restore') {
        const refreshed = await beginCopyrightRestorePreparation(
          legal,
          intent.id,
          'restoration_authorized_pending_delivery',
          transaction,
        )
        if (!refreshed) {
          await rollbackCopyrightRestorePreparation(transaction)
          return commitCopyrightPreparationOutcome(transaction, 'not_claimed')
        }
        legal = refreshed
        current = await getImagePlacementForCopyright(legal.placement_id, {
          query: transaction,
        })
        if (!isCurrentPlacementForIntent(current, legal)) {
          await rollbackCopyrightRestorePreparation(transaction)
          await completeCopyrightActionIntentInTransaction({
            intentId: intent.id,
            leaseToken: intent.lease_token,
            outcome: 'stale',
            completedAt: now,
            failureMessage:
              'Authoritative placement no longer matches the intent revision and asset.',
            query: transaction,
          })
          return commitCopyrightPreparationOutcome(transaction, 'stale')
        }
        if (await hasCopyrightActionBlocker(legal, now, transaction)) {
          await rollbackCopyrightRestorePreparation(transaction)
          return completeBlockedCopyrightAction({
            intentId: intent.id,
            leaseToken: intent.lease_token,
            legal,
            placement: current,
            now,
            query: transaction,
          })
        }
      }
      if (legal.action === 'restore')
        await prepublishWithholdIfNeeded({ legal, placement: current, query: transaction })
      const mutation = await mutateCopyrightPlacement({
        intentId: intent.id,
        legal,
        current,
        now,
        query: transaction,
      })
      if ('terminal' in mutation) {
        if (legal.action === 'restore') await rollbackCopyrightRestorePreparation(transaction)
        if (legal.action === 'restore')
          await completeCopyrightActionIntentInTransaction({
            intentId: intent.id,
            leaseToken: intent.lease_token,
            outcome: 'stale',
            completedAt: now,
            failureMessage: mutation.failureMessage,
            query: transaction,
          })
        return commitCopyrightPreparationOutcome(transaction, mutation.terminal)
      }
      if (legal.action === 'restore') {
        await authorizeRestoreBeforeDelivery({
          legal,
          intentId: intent.id,
          now,
          query: transaction,
        })
      }
      const staged = await stageImagePlacementDeliveryRecord(
        {
          placementId: mutation.placement.placementId,
          revision: mutation.placement.revision,
          imageId: mutation.placement.imageId,
          state: legal.action === 'restore' ? 'allow' : 'withheld',
        },
        { query: transaction },
      )
      if (
        legal.action === 'restore' &&
        !(await readCopyrightActionPreparation(intent.id, intent.lease_token, transaction))
      ) {
        await rollbackCopyrightRestorePreparation(transaction)
        return commitCopyrightPreparationOutcome(transaction, 'not_claimed')
      }
      await transaction.commit()
      return {
        legal,
        placement: mutation.placement,
        mediaDeliveryRegistryRecordId: staged.mediaDeliveryRegistryRecordId,
      }
    },
    intent.action === 'restore' ? { serializable: true } : {},
  )
}
