import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  lockCopyrightActionDelivery,
  completeCopyrightActionIntentInTransaction,
  insertCopyrightActionLifecycleEvent,
  liftCopyrightRestrictionInTransaction,
} from '../services/copyright-notices/action-delivery-state.mts'
import { createCopyrightPosterNoticesInTransaction } from '../services/copyright-notices/restriction-poster-notices.mts'
import { resolveCopyrightDeadlineIfComplete } from '../services/copyright-notices/action-delivery-finalization.mts'
import { syncCopyrightIncidentsAfterStatutoryRestoreInTransaction } from '../services/copyright-notices/statutory-restoration-incidents.mts'

/** A committed retained-placement result makes its wording observable independently of SSI. */
export async function seedRetainedRestorationStatement(intentId: string) {
  await using query = await beginTransaction()
  const { rows } = await query<{
    lease_token: string
  }>(sql`/* seedRetainedRestorationStatement:claim */
    UPDATE copyright_notice_action_work_items SET lease_token = uuidv7(), attempt_count = 1,
      leased_at = clock_timestamp(), lease_expires_at = clock_timestamp() + INTERVAL '5 minutes',
      available_at = clock_timestamp(), failure_message = NULL
    WHERE id = ${intentId} AND state = 'pending' RETURNING lease_token`)
  const token = rows[0]?.lease_token
  if (!token) throw new Error('Owned retained restore was not pending')
  const legal = await lockCopyrightActionDelivery(intentId, token, query)
  if (!legal || legal.action !== 'restore') throw new Error('Owned retained restore lost authority')
  const { rows: blockers } = await query<{
    target_id: string
  }>(sql`/* seedRetainedRestorationStatement:blocker */
    SELECT target.id AS target_id FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE restriction.id = ${legal.copyright_restriction_id} AND EXISTS (
      SELECT 1 FROM copyright_restrictions other_restriction
      JOIN copyright_notice_targets other_target ON other_target.id = other_restriction.copyright_notice_target_id
      WHERE other_target.placement_id = target.placement_id AND other_restriction.lifted_at IS NULL
      AND other_restriction.id <> restriction.id)`)
  const target = blockers[0]
  if (!target) throw new Error('Owned retained restore has no other active restriction')
  const now = new Date()
  await insertCopyrightActionLifecycleEvent(
    legal,
    intentId,
    'restriction_lifted_placement_retained',
    query,
  )
  await liftCopyrightRestrictionInTransaction(legal.copyright_restriction_id, now, query)
  await createCopyrightPosterNoticesInTransaction(
    {
      noticeId: legal.copyright_notice_id,
      targetId: target.target_id,
      restrictionId: legal.copyright_restriction_id,
      event: 'restriction_ended',
      restorationOutcome: 'still_hidden',
      restorationCause: 'administrator_lift',
    },
    query,
  )
  await resolveCopyrightDeadlineIfComplete(legal.copyright_notice_deadline_id, now, query)
  await completeCopyrightActionIntentInTransaction({
    intentId,
    leaseToken: token,
    outcome: 'completed',
    completedAt: now,
    query,
  })
  await syncCopyrightIncidentsAfterStatutoryRestoreInTransaction(legal, query)
  await query.commit()
}
