import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Appends a staff-entered submission that no moderator has reviewed or assessed yet. */
export async function insertUnreviewedCopyrightSubmission(input: {
  noticeId: string
  kind: 'appeal' | 'counter_notice' | 'court_or_ccb_hold'
  receivedAt: Date
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertUnreviewedCopyrightSubmission */
    INSERT INTO copyright_notice_submissions (
      copyright_notice_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (
      ${input.noticeId}, ${input.kind}, ${input.receivedAt}, 'staff', ${`body-${randomUUID()}`}
    ) RETURNING id`)
  const submissionId = rows[0]?.id
  if (!submissionId) throw new Error('Copyright submission was not inserted')
  return submissionId
}

/** Records a moderator's `confirm` decision, so the restriction no longer waits for review. */
export async function confirmCopyrightRestrictionReview(input: {
  restrictionId: string
  actorUserId: string
}): Promise<void> {
  const { rowCount } = await write(sql`/* confirmCopyrightRestrictionReview */
    UPDATE copyright_restrictions
    SET human_reviewed_at = CURRENT_TIMESTAMP, human_review_action = 'confirm',
      human_reviewed_by_id = ${input.actorUserId}
    WHERE id = ${input.restrictionId} AND human_reviewed_at IS NULL`)
  if (!rowCount) throw new Error(`Copyright restriction ${input.restrictionId} was not reviewed`)
}

/**
 * Inserts an open counter-notice deadline the way a moderator's acceptance does: a counter-notice,
 * its compliant assessment, the deadline, and the counter-notice review, so only the deadline is
 * outstanding. Earliest restoration is four days before escalation, matching the ordering check.
 */
export async function insertOpenCopyrightDeadline(input: {
  noticeId: string
  actorUserId: string
  escalationAt: Date
  restorationDeadlineAt: Date
  targetId?: string
}): Promise<string> {
  const earliestRestorationAt = new Date(input.escalationAt.getTime() - 4 * 24 * 60 * 60 * 1000)
  const { rows } = await write<{ id: string }>(sql`/* insertOpenCopyrightDeadline */
    WITH submission AS (
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (
        ${input.noticeId}, 'counter_notice', CURRENT_TIMESTAMP, 'staff', ${`counter-${randomUUID()}`}
      ) RETURNING id
    ), assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
      )
      SELECT id, CURRENT_TIMESTAMP, ${input.actorUserId}, true FROM submission
      RETURNING id, copyright_notice_submission_id
    ), assessment_target AS (
      INSERT INTO copyright_notice_counter_notice_assessment_targets (
        copyright_notice_submission_assessment_id, copyright_notice_target_id
      ) SELECT id, ${input.targetId}::uuid FROM assessment WHERE ${input.targetId}::uuid IS NOT NULL
    ), deadline AS (
      INSERT INTO copyright_notice_deadlines (
        copyright_notice_id, qualifying_counter_notice_assessment_id, earliest_restoration_at,
        escalation_at, restoration_deadline_at
      )
      SELECT ${input.noticeId}, id, ${earliestRestorationAt}, ${input.escalationAt},
        ${input.restorationDeadlineAt}
      FROM assessment RETURNING id
    ), review AS (
      INSERT INTO copyright_notice_counter_notice_reviews (
        copyright_notice_submission_id, copyright_notice_submission_assessment_id,
        copyright_notice_deadline_id, reviewed_at, reviewed_by_id, accepted, rationale_ciphertext
      )
      SELECT assessment.copyright_notice_submission_id, assessment.id, deadline.id,
        CURRENT_TIMESTAMP, ${input.actorUserId}, true, ${`rationale-${randomUUID()}`}
      FROM assessment CROSS JOIN deadline
    )
    SELECT id FROM deadline`)
  const deadlineId = rows[0]?.id
  if (!deadlineId) throw new Error('Copyright deadline was not inserted')
  return deadlineId
}

/** Cancels an open deadline, its one permitted terminal transition. */
export async function cancelCopyrightDeadline(deadlineId: string): Promise<void> {
  const { rowCount } = await write(sql`/* cancelCopyrightDeadline */
    UPDATE copyright_notice_deadlines SET cancelled_at = CURRENT_TIMESTAMP
    WHERE id = ${deadlineId} AND resolved_at IS NULL AND cancelled_at IS NULL`)
  if (!rowCount) throw new Error(`Copyright deadline ${deadlineId} was not cancelled`)
}

/** Inserts a scoped hold assessment and optional immutable resolution for paging fixtures. */
export async function insertAssessedCopyrightLegalHold(input: {
  noticeId: string
  actorUserId: string
  targetId: string
  receivedAt: Date
  qualifying?: boolean
  resolved?: boolean
}): Promise<string> {
  const submissionId = await insertUnreviewedCopyrightSubmission({
    noticeId: input.noticeId,
    kind: 'court_or_ccb_hold',
    receivedAt: input.receivedAt,
  })
  const qualifies = input.qualifying ?? true
  const { rows } = await write<{ id: string }>(sql`/* insertAssessedCopyrightLegalHold */
    WITH assessment AS (
      INSERT INTO copyright_notice_legal_hold_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, from_original_claimant,
        proceeding_kind, commenced_at, received_by_designated_agent_at, same_material, rationale_ciphertext
      ) VALUES (${submissionId}, CURRENT_TIMESTAMP, ${input.actorUserId}, ${qualifies},
        'federal_court', ${input.receivedAt}, ${input.receivedAt}, true, ${`rationale-${randomUUID()}`})
      RETURNING id
    ), target AS (
      INSERT INTO copyright_notice_legal_hold_assessment_targets (
        copyright_notice_legal_hold_assessment_id, copyright_notice_target_id
      ) SELECT id, ${input.targetId} FROM assessment
    ), resolution AS (
      INSERT INTO copyright_notice_legal_hold_resolutions (
        copyright_notice_legal_hold_assessment_id, resolved_at, resolved_by_id, resolution_kind, rationale_ciphertext
      ) SELECT id, CURRENT_TIMESTAMP, ${input.actorUserId}, 'dismissed', ${`resolution-${randomUUID()}`}
        FROM assessment WHERE ${input.resolved ?? false}
    ) SELECT id FROM assessment`)
  if (!rows[0]) throw new Error('Copyright hold assessment was not inserted')
  return rows[0].id
}

/** A second target on the same case for exact material-scope paging checks. */
export async function insertCopyrightPagingTarget(
  noticeId: string,
  imageId: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertCopyrightPagingTarget */
    WITH binding AS (
      INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
      VALUES (${randomUUID()}, ${imageId}, 'post') RETURNING placement_id
    ), target AS (
      INSERT INTO copyright_notice_targets (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      SELECT ${noticeId}, placement_id, 1, ${`https://example.test/${randomUUID()}`} FROM binding RETURNING id, placement_id
    ), image AS (
      INSERT INTO copyright_notice_target_images (copyright_notice_target_id, placement_id, image_id)
      SELECT id, placement_id, ${imageId} FROM target
    ) SELECT id FROM target`)
  if (!rows[0]) throw new Error('Copyright paging target was not inserted')
  return rows[0].id
}

/** Adds a still-restricted target to an existing counter-notice assessment. */
export async function attachCopyrightPagingDeadlineTarget(input: {
  deadlineId: string
  targetId: string
  restrictionId: string
}): Promise<void> {
  await write(sql`/* attachCopyrightPagingDeadlineTarget */
    WITH restricted AS (
      INSERT INTO copyright_restrictions (
        copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id,
        human_reviewed_at, human_review_action, human_reviewed_by_id
      ) SELECT ${input.targetId}, authorizing_assessment_id, CURRENT_TIMESTAMP, imposed_by_id,
        CURRENT_TIMESTAMP, 'confirm', imposed_by_id
        FROM copyright_restrictions WHERE id = ${input.restrictionId}
    ) INSERT INTO copyright_notice_counter_notice_assessment_targets (
      copyright_notice_submission_assessment_id, copyright_notice_target_id
    ) SELECT qualifying_counter_notice_assessment_id, ${input.targetId}
      FROM copyright_notice_deadlines WHERE id = ${input.deadlineId}`)
}
