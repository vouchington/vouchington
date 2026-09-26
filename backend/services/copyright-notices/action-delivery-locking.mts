import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightTargetRestoreIsBlocked } from './court-hold-assessment-gate.mts'
import type { CopyrightActionDeliveryOutcome } from './action-delivery-state.mts'
export type LockedCopyrightActionDelivery = {
  copyright_notice_id: string
  copyright_restriction_id: string
  placement_key: string
  image_id: string
  expected_placement_revision: number
  action: 'withhold' | 'restore'
  copyright_notice_deadline_id: string | null
  restriction_lifted_at: Date | null
  human_reviewed_at: Date | null
  human_review_action: 'confirm' | 'reverse' | null
  reversal_authorized: boolean
  hold_resolution_authorized: boolean
  earliest_restoration_at: Date | null
  resolved_at: Date | null
  cancelled_at: Date | null
}
export async function getCopyrightActionPlacementKey(
  intentId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<string | null> {
  const { rows } = await query<{ placement_key: string }>(sql`
    /* getCopyrightActionPlacementKey */
    SELECT target.placement_key
    FROM copyright_notice_action_intents intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE intent.id = ${intentId} AND intent.state = 'claimed'
  `)
  return rows[0]?.placement_key ?? null
}

export async function lockCopyrightActionDelivery(
  intentId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<LockedCopyrightActionDelivery | null> {
  const { rows } = await query<
    Omit<LockedCopyrightActionDelivery, 'earliest_restoration_at' | 'resolved_at' | 'cancelled_at'>
  >(sql`
    /* lockCopyrightActionDelivery */
    SELECT target.copyright_notice_id, intent.copyright_restriction_id, target.placement_key,
      target_image.image_id, intent.expected_placement_revision, intent.action,
      intent.copyright_notice_deadline_id,
      restriction.lifted_at AS restriction_lifted_at, restriction.human_reviewed_at,
      restriction.human_review_action,
      EXISTS (
        SELECT 1 FROM copyright_notice_appeal_reviews appeal_review
        WHERE appeal_review.copyright_restriction_id = restriction.id
          AND appeal_review.action = 'reverse'
      ) AS reversal_authorized,
      EXISTS (
        SELECT 1
        FROM copyright_legal_hold_restrictions hold_restriction
        JOIN copyright_notice_legal_hold_resolutions hold_resolution
          ON hold_resolution.copyright_notice_legal_hold_assessment_id =
            hold_restriction.copyright_notice_legal_hold_assessment_id
        WHERE hold_restriction.copyright_restriction_id = restriction.id
      ) AS hold_resolution_authorized
    FROM copyright_notice_action_intents intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    JOIN copyright_notice_target_images target_image
      ON target_image.copyright_notice_target_id = target.id
    WHERE intent.id = ${intentId} AND intent.state = 'claimed'
    FOR UPDATE OF intent, restriction, target
  `)
  const locked = rows[0]
  if (!locked) return null
  if (!locked.copyright_notice_deadline_id) {
    return {
      ...locked,
      earliest_restoration_at: null,
      resolved_at: null,
      cancelled_at: null,
    }
  }
  const { rows: deadlineRows } = await query<
    Pick<LockedCopyrightActionDelivery, 'earliest_restoration_at' | 'resolved_at' | 'cancelled_at'>
  >(sql`
    /* lockCopyrightActionDelivery:deadline */
    SELECT earliest_restoration_at, resolved_at, cancelled_at
    FROM copyright_notice_deadlines
    WHERE id = ${locked.copyright_notice_deadline_id}
    FOR UPDATE
  `)
  const deadline = deadlineRows[0]
  return deadline ? { ...locked, ...deadline } : null
}

export async function hasCopyrightActionBlocker(
  intent: LockedCopyrightActionDelivery,
  now: Date,
  query: Awaited<ReturnType<typeof beginTransaction>>,
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
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<boolean> {
  const { rows } = await query<{ blocked: boolean }>(sql`
    /* hasOtherActiveCopyrightRestrictions */
    SELECT EXISTS (
      SELECT 1
      FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.placement_key = ${intent.placement_key}
        AND restriction.id <> ${intent.copyright_restriction_id}
        AND restriction.lifted_at IS NULL
    ) AS blocked
  `)
  return rows[0]?.blocked ?? true
}

export async function liftCopyrightRestrictionInTransaction(
  restrictionId: string,
  now: Date,
  query: Awaited<ReturnType<typeof beginTransaction>>,
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
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  await query(sql`/* processCopyrightActionIntent:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, metadata)
    VALUES (${legal.copyright_notice_id}, ${eventType}, ${JSON.stringify({
      intentId,
      restrictionId: legal.copyright_restriction_id,
    })}::jsonb)
  `)
}

export async function completeCopyrightActionIntentInTransaction(input: {
  intentId: string
  outcome: CopyrightActionDeliveryOutcome
  completedAt: Date
  failureMessage?: string
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<void> {
  await input.query(sql`/* completeCopyrightActionIntentInTransaction */
    UPDATE copyright_notice_action_intents
    SET state = ${input.outcome}, completed_at = ${input.completedAt},
      completed_at_reason = ${input.outcome}, failure_message = ${input.failureMessage ?? null},
      next_attempt_at = NULL
    WHERE id = ${input.intentId} AND state = 'claimed'
  `)
}
