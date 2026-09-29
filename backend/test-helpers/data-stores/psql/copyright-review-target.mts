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
