import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function recoverMissingDecisionAssessments(): Promise<void> {
  await write(sql`/* recoverMissingCopyrightDecisionAssessments */
    WITH candidates AS (
      SELECT DISTINCT ON (submission_id)
        submission_id, copyright_notice_id, assessed_by_id, screening_id
      FROM (
        SELECT submission.id AS submission_id, submission.copyright_notice_id,
          review.reviewed_by_id AS assessed_by_id, NULL::uuid AS screening_id, 1 AS priority
        FROM copyright_notice_form_intake_reviews review
        JOIN copyright_notice_form_intakes intake
          ON intake.id = review.copyright_notice_form_intake_id
        JOIN copyright_notice_submissions submission
          ON submission.id = intake.copyright_notice_submission_id
        WHERE review.accepted
        UNION ALL
        SELECT submission.id AS submission_id, submission.copyright_notice_id,
          review.reviewed_by_id AS assessed_by_id, NULL::uuid AS screening_id, 2 AS priority
        FROM copyright_notice_email_intake_reviews review
        JOIN copyright_notice_submissions submission
          ON submission.copyright_notice_id = review.promoted_copyright_notice_id
          AND submission.kind = 'notice'
        WHERE review.accepted
      ) durable_decisions
      WHERE NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments assessment
        WHERE assessment.copyright_notice_submission_id = durable_decisions.submission_id
      )
      ORDER BY submission_id, priority DESC
    ), inserted AS (
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id,
        substantially_compliant, copyright_notice_form_screening_id
      )
      SELECT submission_id, CURRENT_TIMESTAMP, assessed_by_id, true, screening_id
      FROM candidates
      RETURNING id, copyright_notice_submission_id, assessed_by_id
    ), requests AS (
      INSERT INTO copyright_notice_enforcement_requests (
        copyright_notice_submission_assessment_id, copyright_notice_id, imposed_by_id
      )
      SELECT inserted.id, submission.copyright_notice_id, inserted.assessed_by_id
      FROM inserted
      JOIN copyright_notice_submissions submission
        ON submission.id = inserted.copyright_notice_submission_id
      ORDER BY inserted.id ASC NULLS LAST
      ON CONFLICT (copyright_notice_submission_assessment_id) DO NOTHING
    )
    INSERT INTO copyright_notice_lifecycle_events (
      copyright_notice_id, event_type, actor_user_id, metadata
    )
    SELECT submission.copyright_notice_id, 'submission_assessed', inserted.assessed_by_id,
      '{"recovered_from_durable_decision":true}'::jsonb
    FROM inserted
    JOIN copyright_notice_submissions submission
      ON submission.id = inserted.copyright_notice_submission_id
  `)
}
