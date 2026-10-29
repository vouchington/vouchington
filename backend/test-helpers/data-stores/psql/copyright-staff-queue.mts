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
  now?: Date
}): Promise<string> {
  const missed = input.state === 'missed'
  const { rows } = await write<{
    id: string
    assessment_id: string
    submission_id: string
  }>(sql`/* insertOpenCopyrightCounterNoticeDeadline */
    WITH submission AS (
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (
        ${input.noticeId}, 'counter_notice', COALESCE(${input.now ?? null}::timestamptz, CURRENT_TIMESTAMP) - INTERVAL '20 days', 'staff',
        ${`counter-${randomUUID()}`}
      ) RETURNING id
    ), assessment_identity AS (
      INSERT INTO copyright_notice_submission_assessment_identities (
        copyright_notice_id, copyright_notice_submission_id
      ) SELECT ${input.noticeId}, id FROM submission
      RETURNING id, copyright_notice_submission_id
    ), assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
      )
      SELECT id, copyright_notice_submission_id,
        COALESCE(${input.now ?? null}::timestamptz, CURRENT_TIMESTAMP) - INTERVAL '19 days',
        ${input.reviewerUserId}, true FROM assessment_identity
      RETURNING id, copyright_notice_submission_id
    ), deadline AS (
      INSERT INTO copyright_notice_deadlines (
        copyright_notice_id, qualifying_counter_notice_assessment_identity_id, earliest_restoration_at,
        escalation_at, restoration_deadline_at
      )
      SELECT ${input.noticeId}, id, COALESCE(${input.now ?? null}::timestamptz, CURRENT_TIMESTAMP) - INTERVAL '10 days',
        CASE WHEN ${missed} THEN COALESCE(${input.now ?? null}::timestamptz, CURRENT_TIMESTAMP) - INTERVAL '3 days'
          ELSE COALESCE(${input.now ?? null}::timestamptz, CURRENT_TIMESTAMP) - INTERVAL '1 hour' END,
        CASE WHEN ${missed} THEN COALESCE(${input.now ?? null}::timestamptz, CURRENT_TIMESTAMP) - INTERVAL '1 day'
          ELSE COALESCE(${input.now ?? null}::timestamptz, CURRENT_TIMESTAMP) + INTERVAL '2 days' END
      FROM assessment RETURNING id
    ), review AS (
      INSERT INTO copyright_notice_counter_notice_reviews (
        copyright_notice_submission_id, copyright_notice_submission_assessment_identity_id,
        copyright_notice_deadline_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext
      )
      SELECT assessment.copyright_notice_submission_id, assessment.id, deadline.id,
        COALESCE(${input.now ?? null}::timestamptz, CURRENT_TIMESTAMP) - INTERVAL '19 days', ${input.reviewerUserId}, true,
        ${`rationale-${randomUUID()}`}
      FROM assessment CROSS JOIN deadline
    )
    SELECT deadline.id, assessment.id AS assessment_id,
      assessment.copyright_notice_submission_id AS submission_id
    FROM deadline CROSS JOIN assessment`)
  const deadlineId = rows[0]?.id
  if (!deadlineId) throw new Error(`Copyright deadline for ${input.noticeId} was not inserted`)
  await write(sql`/* insertOpenCopyrightCounterNoticeDeadline:currentAssessment */
    UPDATE copyright_notice_submissions
    SET current_assessment_identity_id = ${rows[0]!.assessment_id},
      current_assessment_is_substantially_compliant = true,
      current_assessed_at = COALESCE(${input.now ?? null}::timestamptz, CURRENT_TIMESTAMP) - INTERVAL '19 days',
      current_assessed_by_id = ${input.reviewerUserId}
    WHERE id = ${rows[0]!.submission_id}
  `)
  return deadlineId
}
