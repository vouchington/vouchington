import { noticeHasUnassessedCourtOrCcbFiling } from '../services/copyright-notices/court-hold-assessment-gate.mts'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withholdImagePlacementForCopyright } from '../services/images/placements.mts'
import {
  stageImagePlacementDeliveryRecord,
  publishStagedMediaDeliveryRecord,
} from '../services/media-delivery-safety/index.mts'
import {
  completeCopyrightActionIntentInTransaction,
  insertCopyrightActionLifecycleEvent,
  lockCopyrightActionDelivery,
} from '../services/copyright-notices/action-delivery-locking.mts'
import { invalidateCopyrightPlacementCache } from '../services/copyright-notices/action-delivery-cache.mts'

/** Commit a canonical delivered withhold dependency without invoking a SERIALIZABLE worker. */
export async function seedRestorationSceneWithhold(intentId: string, now = new Date()) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    lease_token: string
  }>(sql`/* seedRestorationSceneWithhold:claim */
    UPDATE copyright_notice_action_work_items SET lease_token = uuidv7(), attempt_count = 1,
      leased_at = clock_timestamp(), lease_expires_at = clock_timestamp() + INTERVAL '5 minutes',
      available_at = clock_timestamp(), failure_message = NULL
    WHERE id = ${intentId} AND state = 'pending' RETURNING lease_token`)
  const leaseToken = rows[0]?.lease_token
  if (!leaseToken) throw new Error('Owned initial withhold was not pending')
  const legal = await lockCopyrightActionDelivery(intentId, leaseToken, transaction)
  if (!legal || legal.action !== 'withhold') throw new Error('Owned withhold authority disappeared')
  const mutation = await withholdImagePlacementForCopyright(
    { placementId: legal.placement_id, expectedRevision: legal.expected_placement_revision },
    { query: transaction },
  )
  if (mutation.status !== 'applied')
    throw new Error(`Owned initial withhold was ${mutation.status}`)
  const placement = mutation.placement
  const staged = await stageImagePlacementDeliveryRecord(
    {
      placementId: placement.placementId,
      revision: placement.revision,
      imageId: placement.imageId,
      state: 'withheld',
    },
    { query: transaction },
  )
  await insertCopyrightActionLifecycleEvent(legal, intentId, 'placement_withheld', transaction)
  await completeCopyrightActionIntentInTransaction({
    intentId,
    leaseToken,
    outcome: 'completed',
    completedAt: now,
    query: transaction,
  })
  await invalidateCopyrightPlacementCache(legal.placement_id, transaction)
  await transaction.commit()
  await publishStagedMediaDeliveryRecord(staged.mediaDeliveryRegistryRecordId)
  const { rows: published } = await write<{
    desired_state: string
    state: string
  }>(sql`/* seedRestorationSceneWithhold:published */
    SELECT desired_state, state FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = ${staged.mediaDeliveryRegistryRecordId}`)
  if (published[0]?.desired_state !== 'withheld' || published[0]?.state !== 'completed')
    throw new Error('Owned withheld tuple was not published')
  return placement
}

export async function assertRestorationSceneFilingBlocks(noticeId: string) {
  await using transaction = await beginTransaction()
  if (!(await noticeHasUnassessedCourtOrCcbFiling(noticeId, transaction)))
    throw new Error('Committed court filing did not independently block restoration')
  await transaction.commit()
}
