import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Records a staff decision on a form intake so the intake itself no longer queues its case. */
export async function insertReviewedCopyrightFormIntake(input: {
  noticeId: string
  reviewerUserId: string
}): Promise<void> {
  const { rowCount } = await write(sql`/* insertReviewedCopyrightFormIntake */
    INSERT INTO copyright_notice_form_intake_reviews (
      copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext
    )
    SELECT intake.id, CURRENT_TIMESTAMP, ${input.reviewerUserId}, true,
      ${`rationale-${randomUUID()}`}
    FROM copyright_notice_form_intakes intake
    WHERE intake.copyright_notice_id = ${input.noticeId}`)
  if (!rowCount) throw new Error(`Copyright form intake for ${input.noticeId} was not reviewed`)
}

/**
 * Adds a reviewed, accepted counter notice whose restoration deadline is still open. A `due`
 * deadline is past escalation but not restoration; a `missed` one is past both.
 */
export async function insertOpenCopyrightCounterNoticeDeadline(input: {
  noticeId: string
  reviewerUserId: string
  state: 'due' | 'missed'
}): Promise<string> {
  const missed = input.state === 'missed'
  const { rows } = await write<{ id: string }>(sql`/* insertOpenCopyrightCounterNoticeDeadline */
    WITH submission AS (
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (
        ${input.noticeId}, 'counter_notice', CURRENT_TIMESTAMP - INTERVAL '20 days', 'staff',
        ${`counter-${randomUUID()}`}
      ) RETURNING id
    ), assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
      )
      SELECT id, CURRENT_TIMESTAMP - INTERVAL '19 days', ${input.reviewerUserId}, true
      FROM submission RETURNING id, copyright_notice_submission_id
    ), deadline AS (
      INSERT INTO copyright_notice_deadlines (
        copyright_notice_id, qualifying_counter_notice_assessment_id, earliest_restoration_at,
        escalation_at, restoration_deadline_at
      )
      SELECT ${input.noticeId}, id, CURRENT_TIMESTAMP - INTERVAL '10 days',
        CASE WHEN ${missed} THEN CURRENT_TIMESTAMP - INTERVAL '3 days'
          ELSE CURRENT_TIMESTAMP - INTERVAL '1 hour' END,
        CASE WHEN ${missed} THEN CURRENT_TIMESTAMP - INTERVAL '1 day'
          ELSE CURRENT_TIMESTAMP + INTERVAL '2 days' END
      FROM assessment RETURNING id
    ), review AS (
      INSERT INTO copyright_notice_counter_notice_reviews (
        copyright_notice_submission_id, copyright_notice_submission_assessment_id,
        copyright_notice_deadline_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext
      )
      SELECT assessment.copyright_notice_submission_id, assessment.id, deadline.id,
        CURRENT_TIMESTAMP - INTERVAL '19 days', ${input.reviewerUserId}, true,
        ${`rationale-${randomUUID()}`}
      FROM assessment CROSS JOIN deadline
    )
    SELECT id FROM deadline`)
  const deadlineId = rows[0]?.id
  if (!deadlineId) throw new Error(`Copyright deadline for ${input.noticeId} was not inserted`)
  return deadlineId
}
