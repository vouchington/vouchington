import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { reverseAutomatedCopyrightRestrictions } from './form-reviews-reversal.mts'

/** Replays the durable effects of a moderator rejection after a post-commit interruption. */
export async function recoverRejectedCopyrightFormReviewEffects(): Promise<void> {
  const { rows } = await write<{ intake_id: string }>(sql`
    /* recoverRejectedCopyrightFormReviewEffects:list */
    SELECT review.copyright_notice_form_intake_id AS intake_id
    FROM copyright_notice_form_intake_reviews review
    JOIN copyright_notice_form_intakes intake
      ON intake.id = review.copyright_notice_form_intake_id
    WHERE NOT review.accepted AND review.reviewed_by_id IS NOT NULL
      AND (
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
            AND restriction.lifted_at IS NULL
            AND restriction.human_review_action IS NULL
        )
      )
    ORDER BY review.copyright_notice_form_intake_id
    LIMIT 100
  `)
  for (const row of rows) {
    // oxlint-disable-next-line no-await-in-loop -- each intake owns an advisory lock.
    await recoverRejectedCopyrightFormReviewEffect(row.intake_id)
  }
}

async function recoverRejectedCopyrightFormReviewEffect(intakeId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* recoverRejectedCopyrightFormReviewEffect:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-form-review:${intakeId}`}, 0))
  `)
  const { rows } = await transaction<{
    notice_id: string
    submission_id: string
    reviewed_by_id: string
    assessment_id: string | null
    assessed_by_id: string | null
    substantially_compliant: boolean | null
  }>(sql`/* recoverRejectedCopyrightFormReviewEffect:state */
    SELECT intake.copyright_notice_id AS notice_id,
      intake.copyright_notice_submission_id AS submission_id, review.reviewed_by_id,
      assessment.id AS assessment_id, assessment.assessed_by_id, assessment.substantially_compliant
    FROM copyright_notice_form_intakes intake
    JOIN copyright_notice_submissions submission
      ON submission.id = intake.copyright_notice_submission_id
    JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
    JOIN copyright_notice_form_intake_reviews review
      ON review.copyright_notice_form_intake_id = intake.id
      AND NOT review.accepted AND review.reviewed_by_id IS NOT NULL
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
  if (state.substantially_compliant !== false || state.assessed_by_id === null) {
    await transaction(sql`/* recoverRejectedCopyrightFormReviewEffect:assessment */
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant,
        supersedes_assessment_id
      ) VALUES (
        ${state.submission_id}, CURRENT_TIMESTAMP, ${state.reviewed_by_id}, false,
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
  )
}
