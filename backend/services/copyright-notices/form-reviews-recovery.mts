import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { reverseAutomatedCopyrightRestrictions } from './form-reviews-reversal.mts'
import {
  parseCopyrightSweepPageOptions,
  toCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

/**
 * Pages the form intakes whose rejected review still has durable effects to replay after a
 * post-commit interruption, keyed by the intake ID that `recoverRejectedCopyrightFormReviewEffect`
 * takes.
 */
export async function searchRecoverableCopyrightFormReviewIntakeIds(
  options: CopyrightSweepPageOptions = {},
): Promise<CopyrightSweepIdPage> {
  const { limit, afterId } = parseCopyrightSweepPageOptions(
    options,
    'Invalid copyright form review recovery cursor',
  )
  const query = sql`/* searchRecoverableCopyrightFormReviewIntakeIds */
    SELECT review.copyright_notice_form_intake_id AS id
    FROM copyright_notice_form_intake_reviews review
    JOIN copyright_notice_form_intakes intake
      ON intake.id = review.copyright_notice_form_intake_id
    WHERE NOT review.accepted
      AND (
        review.reviewed_by_id IS NOT NULL AND (
          NOT EXISTS (
            SELECT 1 FROM copyright_notice_submission_assessments assessment
            WHERE assessment.copyright_notice_submission_id = intake.copyright_notice_submission_id
              AND NOT assessment.substantially_compliant
              AND assessment.assessed_by_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM copyright_notice_submission_assessments newer
                WHERE newer.supersedes_assessment_id = assessment.id
              )
          ) OR EXISTS (
            SELECT 1 FROM copyright_restrictions restriction
            JOIN copyright_notice_submission_assessments assessment
              ON assessment.id = restriction.authorizing_assessment_id
            WHERE assessment.copyright_notice_submission_id = intake.copyright_notice_submission_id
              AND assessment.assessed_by_id IS NULL
              AND assessment.copyright_notice_form_screening_id IS NOT NULL
              AND restriction.lifted_at IS NULL
              AND restriction.human_review_action IS NULL
          )
        ) OR review.reviewed_by_id IS NULL AND (
          EXISTS (
            SELECT 1 FROM copyright_notice_submission_assessments assessment
            JOIN copyright_restrictions restriction
              ON restriction.authorizing_assessment_id = assessment.id
            WHERE assessment.copyright_notice_submission_id = intake.copyright_notice_submission_id
              AND assessment.assessed_by_id IS NULL
              AND assessment.copyright_notice_form_screening_id IS NOT NULL
              AND restriction.lifted_at IS NULL
              AND restriction.human_review_action IS NULL
          ) OR EXISTS (
            SELECT 1 FROM copyright_notice_submission_assessments assessment
            JOIN copyright_notice_enforcement_requests request
              ON request.copyright_notice_submission_assessment_id = assessment.id
            WHERE assessment.copyright_notice_submission_id = intake.copyright_notice_submission_id
              AND assessment.assessed_by_id IS NULL
              AND assessment.copyright_notice_form_screening_id IS NOT NULL
              AND request.state IN ('pending', 'claimed')
          )
        )
      )`
  if (afterId) query.append(sql`\n      AND review.copyright_notice_form_intake_id > ${afterId}`)
  query.append(sql`\n    ORDER BY review.copyright_notice_form_intake_id LIMIT ${limit + 1}`)
  const { rows } = await write<{ id: string }>(query)
  return toCopyrightSweepIdPage(rows, limit)
}

/** Replays the durable effects of one moderator rejection after a post-commit interruption. */
export async function recoverRejectedCopyrightFormReviewEffect(intakeId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* recoverRejectedCopyrightFormReviewEffect:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-form-review:${intakeId}`}, 0))
  `)
  const { rows } = await transaction<{
    notice_id: string
    submission_id: string
    reviewed_at: Date
    reviewed_by_id: string | null
    assessment_id: string | null
    assessed_by_id: string | null
    substantially_compliant: boolean | null
  }>(sql`/* recoverRejectedCopyrightFormReviewEffect:state */
    SELECT intake.copyright_notice_id AS notice_id,
      intake.copyright_notice_submission_id AS submission_id, review.reviewed_at, review.reviewed_by_id,
      assessment.id AS assessment_id, assessment.assessed_by_id, assessment.substantially_compliant
    FROM copyright_notice_form_intakes intake
    JOIN copyright_notice_submissions submission
      ON submission.id = intake.copyright_notice_submission_id
    JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
    JOIN copyright_notice_form_intake_reviews review
      ON review.copyright_notice_form_intake_id = intake.id
      AND NOT review.accepted
    LEFT JOIN copyright_notice_submission_assessments assessment
      ON assessment.copyright_notice_submission_id = intake.copyright_notice_submission_id
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
    WHERE intake.id = ${intakeId}
    FOR UPDATE OF notice, submission, intake, review
  `)
  const state = rows[0]
  if (!state) {
    await transaction.commit()
    return
  }
  if (
    state.reviewed_by_id !== null &&
    (state.substantially_compliant !== false || state.assessed_by_id === null)
  ) {
    await transaction(sql`/* recoverRejectedCopyrightFormReviewEffect:assessment */
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant,
        supersedes_assessment_id
      ) VALUES (
        ${state.submission_id}, ${state.reviewed_at}, ${state.reviewed_by_id}, false,
        ${state.assessment_id}
      )
    `)
    await transaction(sql`/* recoverRejectedCopyrightFormReviewEffect:event */
      INSERT INTO copyright_notice_lifecycle_events (
        copyright_notice_id, event_type, actor_user_id, metadata
      ) VALUES (
        ${state.notice_id}, 'submission_assessed', ${state.reviewed_by_id},
        '{"recovered_from_durable_review":true}'::jsonb
      )
    `)
  }
  await transaction.commit()
  await reverseAutomatedCopyrightRestrictions(
    state.notice_id,
    state.submission_id,
    state.reviewed_by_id,
    state.reviewed_at,
  )
  await completeAutomatedCopyrightEnforcementRequests(state.submission_id)
}

async function completeAutomatedCopyrightEnforcementRequests(submissionId: string): Promise<void> {
  await write(sql`/* completeAutomatedCopyrightEnforcementRequests */
    UPDATE copyright_notice_enforcement_requests request
    SET state = 'completed', claimed_at = NULL, completed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    FROM copyright_notice_submission_assessments assessment
    WHERE request.copyright_notice_submission_assessment_id = assessment.id
      AND assessment.copyright_notice_submission_id = ${submissionId}
      AND assessment.assessed_by_id IS NULL
      AND assessment.copyright_notice_form_screening_id IS NOT NULL
      AND request.state IN ('pending', 'claimed')
  `)
}
