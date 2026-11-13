import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { restoreImagePlacementForCopyright } from '../services/images/placements.mts'
import { authorizeRestoreBeforeDelivery } from '../services/copyright-notices/action-delivery-restore.mts'
import {
  lockCopyrightActionDelivery,
  completeCopyrightActionIntentInTransaction,
  insertCopyrightActionLifecycleEvent,
} from '../services/copyright-notices/action-delivery-locking.mts'
import { invalidateCopyrightPlacementCache } from '../services/copyright-notices/action-delivery-cache.mts'
import {
  stageImagePlacementDeliveryRecord,
  publishStagedMediaDeliveryRecord,
} from '../services/media-delivery-safety/index.mts'

/** A completed restore is an independent fixture for unconditional restoration wording projections. */
export async function seedCompletedReversalStatement(intentId: string) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    lease_token: string
  }>(sql`/* seedCompletedReversalStatement:claim */
    UPDATE copyright_notice_action_work_items SET lease_token = uuidv7(), attempt_count = 1,
      leased_at = clock_timestamp(), lease_expires_at = clock_timestamp() + INTERVAL '5 minutes',
      available_at = clock_timestamp(), failure_message = NULL WHERE id = ${intentId} AND state = 'pending'
    RETURNING lease_token`)
  const token = rows[0]?.lease_token
  if (!token) throw new Error('Owned restore fixture was not pending')
  const legal = await lockCopyrightActionDelivery(intentId, token, transaction)
  if (!legal || legal.action !== 'restore')
    throw new Error('Owned restore fixture lost its authority')
  const mutation = await restoreImagePlacementForCopyright(
    { placementId: legal.placement_id, expectedRevision: legal.expected_placement_revision },
    { query: transaction },
  )
  if (mutation.status !== 'applied') throw new Error(`Owned restore fixture was ${mutation.status}`)
  const now = new Date()
  await authorizeRestoreBeforeDelivery({ intentId, legal, now, query: transaction })
  const placement = mutation.placement
  const staged = await stageImagePlacementDeliveryRecord(
    {
      placementId: placement.placementId,
      revision: placement.revision,
      imageId: placement.imageId,
      state: 'allow',
    },
    { query: transaction },
  )
  await insertCopyrightActionLifecycleEvent(legal, intentId, 'placement_restored', transaction)
  await completeCopyrightActionIntentInTransaction({
    intentId,
    leaseToken: token,
    outcome: 'completed',
    completedAt: now,
    query: transaction,
  })
  await invalidateCopyrightPlacementCache(legal.placement_id, transaction)
  await transaction.commit()
  await publishStagedMediaDeliveryRecord(staged.mediaDeliveryRegistryRecordId)
}
