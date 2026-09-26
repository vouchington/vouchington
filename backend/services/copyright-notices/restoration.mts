import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import { noticeHasUnassessedCourtOrCcbFiling } from './court-hold-assessment-gate.mts'
import type { CopyrightActionIntentRecord, CopyrightLegalHoldAssessmentRecord } from './types.mts'

export type CopyrightRestorationHold = {
  receivedByDesignatedAgentAt: Date | null
  fromOriginalClaimant: boolean
  commenced: boolean
  sameMaterial: boolean
  proceedingKind: 'federal_court' | 'ccb'
}

/**
 * A court/CCB hold is operative only when it came from the original claimant,
 * identifies the same material, and reports a commenced qualifying proceeding.
 */
export function precheckCopyrightRestoration({
  restrictionHumanReviewAt,
  now,
  earliestRestorationAt,
  restorationDeadlineAt,
  otherActiveRestrictionCount,
  hold,
}: {
  restrictionHumanReviewAt: Date | null
  now: Date
  earliestRestorationAt: Date
  restorationDeadlineAt: Date
  otherActiveRestrictionCount: number
  hold: CopyrightRestorationHold | null
}): { eligible: boolean; overdue: boolean } {
  if (!restrictionHumanReviewAt || otherActiveRestrictionCount > 0 || now < earliestRestorationAt)
    return { eligible: false, overdue: now >= restorationDeadlineAt }
  return {
    eligible: !(
      hold?.fromOriginalClaimant &&
      hold.commenced &&
      hold.sameMaterial &&
      hold.receivedByDesignatedAgentAt !== null &&
      hold.receivedByDesignatedAgentAt <= now &&
      (hold.proceedingKind === 'federal_court' || hold.proceedingKind === 'ccb')
    ),
    overdue: now >= restorationDeadlineAt,
  }
}

export async function createEligibleCopyrightRestoreIntent(input: {
  noticeId: string
  targetId: string
  restrictionId: string
  deadlineId: string
  expectedPlacementRevision: number
  now: Date
}): Promise<CopyrightActionIntentRecord> {
  await using transaction = await beginTransaction()
  const { rows: targetKeys } = await transaction<{ placement_key: string }>(
    sql`/* createEligibleCopyrightRestoreIntent:findPlacement */
    SELECT placement_key
    FROM copyright_notice_targets
    WHERE id = ${input.targetId} AND copyright_notice_id = ${input.noticeId}
  `,
  )
  const target = targetKeys[0]
  assert(target, 404, 'Copyright notice restoration record not found')
  await transaction(sql`/* createEligibleCopyrightRestoreIntent:placementAdvisoryLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${target.placement_key}, 0))
  `)
  const { rows: noticeLocks } = await transaction<{ id: string }>(
    sql`/* createEligibleCopyrightRestoreIntent:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE
  `,
  )
  assert(noticeLocks[0], 404, 'Copyright notice restoration record not found')
  const { rows } = await transaction<{
    human_reviewed_at: Date | null
    placement_key: string
    placement_revision: number
    lifted_at: Date | null
    earliest_restoration_at: Date
    restoration_deadline_at: Date
    resolved_at: Date | null
    cancelled_at: Date | null
  }>(sql`/* createEligibleCopyrightRestoreIntent:lock */
    SELECT r.human_reviewed_at, t.placement_key, t.placement_revision, r.lifted_at,
      d.earliest_restoration_at, d.restoration_deadline_at, d.resolved_at, d.cancelled_at
    FROM copyright_notices n
    JOIN copyright_notice_targets t ON t.copyright_notice_id = n.id
    JOIN copyright_restrictions r ON r.copyright_notice_target_id = t.id
    JOIN copyright_notice_deadlines d ON d.copyright_notice_id = n.id
    JOIN copyright_notice_submission_assessments assessment
      ON assessment.id = d.qualifying_counter_notice_assessment_id
    JOIN copyright_notice_counter_notice_assessment_targets assessment_target
      ON assessment_target.copyright_notice_submission_assessment_id = assessment.id
      AND assessment_target.copyright_notice_target_id = t.id
    JOIN copyright_notice_submissions counter_notice
      ON counter_notice.id = assessment.copyright_notice_submission_id
    WHERE n.id = ${input.noticeId}
      AND t.id = ${input.targetId}
      AND t.placement_key = ${target.placement_key}
      AND r.id = ${input.restrictionId}
      AND d.id = ${input.deadlineId}
      AND counter_notice.kind = 'counter_notice'
      AND assessment.substantially_compliant
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer_assessment
        WHERE newer_assessment.supersedes_assessment_id = assessment.id
      )
    FOR UPDATE OF n, t, r, d
  `)
  const locked = rows[0]
  assert(locked, 404, 'Copyright notice restoration record not found')
  assert(
    locked.placement_revision === input.expectedPlacementRevision,
    409,
    'Placement revision changed',
  )
  assert(locked.lifted_at === null, 409, 'Copyright restriction is already lifted')
  assert(
    locked.resolved_at === null && locked.cancelled_at === null,
    409,
    'Restoration deadline is closed',
  )
  assert(
    !(await noticeHasUnassessedCourtOrCcbFiling(input.noticeId, transaction)),
    409,
    'Copyright restoration awaits assessment of a court or CCB filing',
  )

  const qualifyingHolds =
    await transaction<CopyrightLegalHoldAssessmentRecord>(sql`/* createEligibleCopyrightRestoreIntent:lockQualifyingHolds */
      SELECT h.*
      FROM copyright_notice_legal_hold_assessments h
      JOIN copyright_notice_submissions s ON s.id = h.copyright_notice_submission_id
      JOIN copyright_notice_legal_hold_assessment_targets hold_target
        ON hold_target.copyright_notice_legal_hold_assessment_id = h.id
      LEFT JOIN copyright_notice_legal_hold_resolutions resolved
        ON resolved.copyright_notice_legal_hold_assessment_id = h.id
      WHERE s.copyright_notice_id = ${input.noticeId}
        AND hold_target.copyright_notice_target_id = ${input.targetId}
        AND resolved.id IS NULL
        AND h.from_original_claimant
        AND h.same_material
        AND h.proceeding_kind IS NOT NULL
        AND h.commenced_at IS NOT NULL
        AND h.received_by_designated_agent_at IS NOT NULL
        AND h.received_by_designated_agent_at <= ${input.now}
      FOR UPDATE OF h
    `)
  const result = precheckCopyrightRestoration({
    restrictionHumanReviewAt: locked.human_reviewed_at,
    now: input.now,
    earliestRestorationAt: locked.earliest_restoration_at,
    restorationDeadlineAt: locked.restoration_deadline_at,
    // Each case becomes independently eligible. The delivery worker lifts this case's restriction
    // while keeping the placement withheld until every other active restriction is resolved.
    otherActiveRestrictionCount: 0,
    hold: qualifyingHolds.rows[0]
      ? {
          receivedByDesignatedAgentAt: qualifyingHolds.rows[0].received_by_designated_agent_at,
          fromOriginalClaimant: qualifyingHolds.rows[0].from_original_claimant,
          commenced: qualifyingHolds.rows[0].commenced_at !== null,
          sameMaterial: qualifyingHolds.rows[0].same_material,
          proceedingKind: qualifyingHolds.rows[0].proceeding_kind as 'federal_court' | 'ccb',
        }
      : null,
  })
  assert(result.eligible, 409, 'Copyright restoration is not eligible')
  const currentPlacement = await getImagePlacementForCopyright(locked.placement_key, {
    query: transaction,
  })
  // An unavailable placement still needs a durable, revision-fenced legal disposition. The worker
  // resolves it without allowing delivery, rather than leaving the deadline and restriction open.
  assert(currentPlacement, 409, 'Copyright placement is unavailable')
  const { rows: intentRows } =
    await transaction<CopyrightActionIntentRecord>(sql`/* createEligibleCopyrightRestoreIntent */
    INSERT INTO copyright_notice_action_intents (
      copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision, action
    ) VALUES (${input.restrictionId}, ${input.deadlineId}, ${currentPlacement.revision}, 'restore')
    ON CONFLICT (copyright_restriction_id, expected_placement_revision, action) DO NOTHING
    RETURNING id, copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision,
      action, completed_at
  `)
  const intent = intentRows[0]
  assert(intent, 409, 'A restore intent already exists for this placement revision')
  await transaction(sql`/* createEligibleCopyrightRestoreIntent:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, metadata)
    VALUES (${input.noticeId}, 'restoration_intent_created', ${JSON.stringify({ restrictionId: input.restrictionId })}::jsonb)
  `)
  await transaction.commit()
  void enqueueApplyCopyrightAction(intent.id)
  return intent
}
