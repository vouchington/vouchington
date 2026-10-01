import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightTargetRestoreIsBlocked } from './court-hold-assessment-gate.mts'
import type { CopyrightActionDeliveryOutcome } from './action-delivery-state-types.mts'
import type { LockedCopyrightActionDelivery } from './action-delivery-locking-types.mts'
import {
  copyrightActionDeliveryFacts,
  lockCopyrightActionDeadline,
  type CopyrightActionFacts,
} from './action-delivery-facts.mts'

export type { LockedCopyrightActionDelivery }
/** Action work takes this domain before placement and row locks, including compensation. */
export async function lockCopyrightActionClaim(
  intentId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* lockCopyrightActionClaim */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-action-claim:${intentId}`}, 0))
  `)
}

/** Claimers skip a worker that is still compensating rather than making its row reclaimable. */
export async function tryLockCopyrightActionClaim(
  intentId: string,
  query: TransactionQuery,
): Promise<boolean> {
  const { rows } = await query<{ locked: boolean }>(sql`/* tryLockCopyrightActionClaim */
    SELECT pg_try_advisory_xact_lock(hashtextextended(${`copyright-action-claim:${intentId}`}, 0)) AS locked
  `)
  return rows[0]?.locked ?? false
}

export async function getCopyrightActionPlacementKey(
  intentId: string,
  leaseToken: string,
  query: TransactionQuery,
): Promise<string | null> {
  const { rows } = await query<{ placement_id: string }>(sql`
    /* getCopyrightActionPlacementKey */
    SELECT target.placement_id
    FROM copyright_notice_action_intents intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE intent.id = ${intentId} AND intent.state = 'claimed' AND intent.lease_token = ${leaseToken}
  `)
  return rows[0]?.placement_id ?? null
}

export async function lockCopyrightActionDelivery(
  intentId: string,
  leaseToken: string,
  query: TransactionQuery,
): Promise<LockedCopyrightActionDelivery | null> {
  const statement = copyrightActionDeliveryFacts()
  statement.append(sql`/* lockCopyrightActionDelivery */
    WHERE intent.id = ${intentId} AND intent.state = 'claimed' AND intent.lease_token = ${leaseToken}
    FOR UPDATE OF intent, restriction, target`)
  const { rows } = await query<CopyrightActionFacts>(statement)
  const locked = rows[0]
  if (!locked) return null
  return lockCopyrightActionDeadline(locked, query)
}

export async function hasCopyrightActionBlocker(
  intent: LockedCopyrightActionDelivery,
  now: Date,
  query: TransactionQuery,
): Promise<boolean> {
  if (intent.action === 'withhold') return false
  const reversalAuthorized =
    intent.human_review_action === 'reverse' ||
    intent.reversal_authorized ||
    intent.hold_resolution_authorized
  if (intent.restriction_lifted_at === null && !reversalAuthorized) {
    if (
      !intent.human_reviewed_at ||
      !intent.earliest_restoration_at ||
      now < intent.earliest_restoration_at ||
      intent.resolved_at !== null ||
      intent.cancelled_at !== null
    ) {
      return true
    }
  }
  return copyrightTargetRestoreIsBlocked(
    intent.copyright_notice_id,
    intent.copyright_restriction_id,
    now,
    query,
  )
}
export async function hasOtherActiveCopyrightRestrictions(
  intent: LockedCopyrightActionDelivery,
  query: TransactionQuery,
): Promise<boolean> {
  const { rows } = await query<{ blocked: boolean }>(sql`
    /* hasOtherActiveCopyrightRestrictions */
    SELECT EXISTS (
      SELECT 1
      FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.placement_id = ${intent.placement_id}
        AND restriction.id <> ${intent.copyright_restriction_id}
        AND restriction.lifted_at IS NULL
    ) AS blocked
  `)
  return rows[0]?.blocked ?? true
}

export async function liftCopyrightRestrictionInTransaction(
  restrictionId: string,
  now: Date,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* processCopyrightActionIntent:liftRestriction */
    UPDATE copyright_restrictions
    SET lifted_at = ${now}, lifted_by_id = NULL
    WHERE id = ${restrictionId} AND lifted_at IS NULL
  `)
}

export async function insertCopyrightActionLifecycleEvent(
  legal: LockedCopyrightActionDelivery,
  intentId: string,
  eventType: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* processCopyrightActionIntent:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, copyright_notice_action_intent_id)
    VALUES (${legal.copyright_notice_id}, ${eventType}, ${intentId})
  `)
}

export async function completeCopyrightActionIntentInTransaction(input: {
  intentId: string
  leaseToken: string
  outcome: CopyrightActionDeliveryOutcome
  completedAt: Date
  failureMessage?: string
  query: TransactionQuery
}): Promise<void> {
  await input.query(sql`/* completeCopyrightActionIntentInTransaction */
    UPDATE copyright_notice_action_intents
    SET state = ${input.outcome}, completed_at = ${input.completedAt},
      completed_at_reason = ${input.outcome}, failure_message = ${input.failureMessage ?? null},
      next_attempt_at = NULL
    WHERE id = ${input.intentId} AND state = 'claimed' AND lease_token = ${input.leaseToken}
  `)
}
