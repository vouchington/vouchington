import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { invalidatePostStrict } from '@services/entity-cache/invalidate-strict'
import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import {
  completeCopyrightActionIntentInTransaction,
  getCopyrightActionPlacementKey,
  hasCopyrightActionBlocker,
  hasOtherActiveCopyrightRestrictions,
  insertCopyrightActionLifecycleEvent,
  lockCopyrightActionDelivery,
} from './action-delivery-state.mts'

export async function finalizeCopyrightActionAfterDelivery(
  intentId: string,
  action: 'withhold' | 'restore',
  now: Date,
  dependencies: CopyrightActionDeliveryDependencies,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const placementKey = await getCopyrightActionPlacementKey(intentId, transaction)
  if (placementKey) await lockCopyrightActionPlacement(placementKey, transaction)
  const legal = await lockCopyrightActionDelivery(intentId, transaction)
  if (!legal) {
    await transaction.commit()
    return false
  }
  await transaction(sql`/* finalizeCopyrightActionAfterDelivery:noticeLock */
    SELECT id FROM copyright_notices WHERE id = ${legal.copyright_notice_id} FOR UPDATE
  `)
  const current = await dependencies.getImagePlacementForCopyright(legal.placement_key, {
    query: transaction,
  })
  if (action === 'withhold' && legal.restriction_lifted_at !== null) {
    if (
      current &&
      !current.deleted &&
      !current.withheld &&
      !(await hasOtherActiveCopyrightRestrictions(legal, transaction))
    ) {
      await dependencies.publishImagePlacementDeliveryRecord(
        {
          placementId: current.placementId,
          revision: current.revision,
          imageId: current.imageId,
          state: 'allow',
        },
        { query: transaction },
      )
    }
    await completeCopyrightActionIntentInTransaction({
      intentId,
      outcome: 'stale',
      completedAt: now,
      failureMessage:
        'The copyright restriction was lifted while its withhold delivery was pending.',
      query: transaction,
    })
    await transaction.commit()
    return false
  }
  if (
    !current ||
    current.deleted ||
    current.imageId !== legal.image_id ||
    current.withheld !== (action === 'withhold')
  ) {
    await completeCopyrightActionIntentInTransaction({
      intentId,
      outcome: 'stale',
      completedAt: now,
      failureMessage: 'Placement changed while its exact delivery tuple was being projected.',
      query: transaction,
    })
    await transaction.commit()
    return false
  }
  if (action === 'restore' && (await restoreIsBlocked(legal, now, transaction))) {
    await dependencies.publishImagePlacementDeliveryRecord(
      {
        placementId: current.placementId,
        revision: current.revision,
        imageId: current.imageId,
        state: 'withheld',
      },
      { query: transaction },
    )
    await completeCopyrightActionIntentInTransaction({
      intentId,
      outcome: 'blocked',
      completedAt: now,
      failureMessage: 'A current copyright blocker was admitted before restore delivery completed.',
      query: transaction,
    })
    await transaction.commit()
    return false
  }
  await completeCopyrightActionIntentInTransaction({
    intentId,
    outcome: 'completed',
    completedAt: now,
    query: transaction,
  })
  await insertCopyrightActionLifecycleEvent(
    legal,
    intentId,
    action === 'withhold' ? 'placement_withheld' : 'placement_restored',
    transaction,
  )
  await invalidateCopyrightPlacementCache(legal.placement_key, transaction, dependencies)
  await transaction.commit()
  return true
}

export async function resolveCopyrightDeadlineIfComplete(
  deadlineId: string | null,
  now: Date,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  if (!deadlineId) return
  await query(sql`/* resolveCopyrightDeadlineIfComplete */
    UPDATE copyright_notice_deadlines deadline
    SET resolved_at = ${now}
    WHERE deadline.id = ${deadlineId}
      AND deadline.resolved_at IS NULL
      AND deadline.cancelled_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM copyright_notice_counter_notice_assessment_targets assessment_target
        JOIN copyright_restrictions restriction
          ON restriction.copyright_notice_target_id = assessment_target.copyright_notice_target_id
        WHERE assessment_target.copyright_notice_submission_assessment_id = deadline.qualifying_counter_notice_assessment_id
          AND restriction.lifted_at IS NULL
      )
  `)
}

export async function lockCopyrightActionPlacement(
  placementKey: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  await query(sql`/* processCopyrightActionIntent:placementAdvisoryLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${placementKey}, 0))
  `)
}

async function restoreIsBlocked(
  legal: Parameters<typeof hasCopyrightActionBlocker>[0],
  now: Date,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<boolean> {
  return (
    (await hasCopyrightActionBlocker(legal, now, query)) ||
    (await hasOtherActiveCopyrightRestrictions(legal, query))
  )
}

async function invalidateCopyrightPlacementCache(
  placementKey: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
  dependencies: CopyrightActionDeliveryDependencies,
): Promise<void> {
  const postId = await dependencies.getPostIdForImagePlacementCopyright(placementKey, { query })
  if (postId) await invalidatePostStrict(postId)
}
