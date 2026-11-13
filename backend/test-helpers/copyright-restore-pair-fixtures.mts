import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  claimActionDeliveryFixture,
  type ActionDeliveryScene,
} from './copyright-action-delivery-contract-fixtures.mts'
import {
  completeCopyrightActionIntentInTransaction,
  insertCopyrightActionLifecycleEvent,
  liftCopyrightRestrictionInTransaction,
} from '../services/copyright-notices/action-delivery-locking.mts'
import { createCopyrightPosterNoticesInTransaction } from '../services/copyright-notices/restriction-poster-notices.mts'
import { resolveCopyrightDeadlineIfComplete } from '../services/copyright-notices/action-delivery-finalization.mts'
import { syncCopyrightIncidentsAfterStatutoryRestoreInTransaction } from '../services/copyright-notices/statutory-restoration-incidents.mts'

/** A committed retained-placement completion, including notices/deadline/incidents, never a retried actor. */
export async function seedRetainedRestorePairMember(
  scene: ActionDeliveryScene,
  now = scene.restorationAt,
) {
  await using query = await beginTransaction()
  const { rows } = await query<{ blocked: boolean }>(sql`/* seedRetainedRestorePairMember:other */
    SELECT EXISTS (SELECT 1 FROM copyright_restrictions restriction JOIN copyright_notice_targets target
      ON target.id = restriction.copyright_notice_target_id WHERE target.placement_id = ${scene.target.placement_id}
      AND restriction.id <> ${scene.restriction.id} AND restriction.lifted_at IS NULL) AS blocked`)
  if (!rows[0]?.blocked)
    throw new Error('Owned retained completion requires its other live restriction')
  const legal = await claimActionDeliveryFixture(scene.restore.id, query)
  await insertCopyrightActionLifecycleEvent(
    legal,
    scene.restore.id,
    'restriction_lifted_placement_retained',
    query,
  )
  await liftCopyrightRestrictionInTransaction(scene.restriction.id, now, query)
  await createCopyrightPosterNoticesInTransaction(
    {
      noticeId: scene.notice.id,
      targetId: scene.target.id,
      restrictionId: scene.restriction.id,
      event: 'restriction_ended',
      restorationOutcome: 'still_hidden',
      restorationCause: 'counter_notice_window',
    },
    query,
  )
  await resolveCopyrightDeadlineIfComplete(scene.restore.copyright_notice_deadline_id, now, query)
  await completeCopyrightActionIntentInTransaction({
    intentId: scene.restore.id,
    leaseToken: legal.lease_token,
    outcome: 'completed',
    completedAt: now,
    query,
  })
  await syncCopyrightIncidentsAfterStatutoryRestoreInTransaction(legal, query)
  await query.commit()
}
