import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { appendCopyrightSubmissionAssessmentInTransaction } from './compliance.mts'
import {
  startCopyrightFormScreening,
  completeCopyrightFormScreening,
} from './form-screening-executions.mts'
import { processCopyrightEnforcementRequest } from './enforcement-requests.mts'

export type CopyrightFormScreeningRecommendation = 'not_obviously_invalid' | 'invalid_or_spam'
/** @public Cross-workspace persistence boundary used by the copyright form-screening agent. */
export async function appendCopyrightFormScreening(input: {
  intakeId: string
  inputSha256: Buffer
  recommendation: CopyrightFormScreeningRecommendation
  rationale: string
  promptVersion: string
  model: string
}): Promise<string> {
  const attempt = await startCopyrightFormScreening(input.intakeId)
  const result = await completeCopyrightFormScreening(attempt, input)
  if (!result) throw new Error('Copyright screening attempt was superseded')
  return result
}
/** Workflow-owned automation gate. Agents only return a recommendation; they cannot call this. */
export async function applyNonSpamSignedInCopyrightFormScreening(
  submissionId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows: intakeIdRows } = await transaction<{ id: string }>(
    sql`/* applyNonSpamSignedInCopyrightFormScreening:intakeId */
      SELECT id FROM copyright_notice_form_intakes
      WHERE copyright_notice_submission_id = ${submissionId}`,
  )
  const intakeId = intakeIdRows[0]?.id
  if (!intakeId) {
    await transaction.commit()
    return
  }
  await transaction(sql`/* applyNonSpamSignedInCopyrightFormScreening:lock */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-form-review:${intakeId}`}, 0))
  `)
  const { rows } = await transaction<{
    intake_id: string
    notice_id: string
    screening_id: string
    form_review_accepted: boolean | null
  }>(sql`/* applyNonSpamSignedInCopyrightFormScreening */
    SELECT intake.id AS intake_id, intake.copyright_notice_id AS notice_id,
      screening.id AS screening_id,
      review.accepted AS form_review_accepted
    FROM copyright_notice_form_intakes intake JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
    JOIN copyright_notice_form_screening_executions execution
      ON execution.copyright_notice_form_intake_id = intake.id AND execution.state = 'completed'
    JOIN copyright_notice_form_screenings screening
      ON screening.id = execution.copyright_notice_form_screening_id
    LEFT JOIN copyright_notice_form_intake_reviews review
      ON review.copyright_notice_form_intake_id = intake.id
    WHERE submission.id = ${submissionId}
      AND fn_current_copyright_form_screening(submission.id, screening.id)
  `)
  const intake = rows[0]
  if (!intake || intake.form_review_accepted !== null) {
    await transaction.commit()
    return
  }
  const { rows: existingAssessments } = await transaction<{
    id: string
  }>(sql`/* applyNonSpamSignedInCopyrightFormScreening:existingAssessment */
    SELECT assessment.id FROM copyright_notice_submission_assessments assessment
    WHERE assessment.copyright_notice_submission_id = ${submissionId}
      AND assessment.assessed_by_id IS NULL
      AND assessment.substantially_compliant
      AND assessment.copyright_notice_form_screening_id = ${intake.screening_id}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
  `)
  const { rows: currentAssessments } = await transaction<{
    id: string
    copyright_notice_form_screening_id: string | null
    substantially_compliant: boolean
  }>(
    sql`/* applyNonSpamSignedInCopyrightFormScreening:currentAssessment */
      SELECT assessment.id, assessment.copyright_notice_form_screening_id, assessment.substantially_compliant
      FROM copyright_notice_submission_assessments assessment
      WHERE assessment.copyright_notice_submission_id = ${submissionId}
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_submission_assessments newer
          WHERE newer.supersedes_assessment_id = assessment.id
        )`,
  )
  const currentAssessment = currentAssessments[0]
  if (
    !existingAssessments[0] &&
    currentAssessment &&
    (currentAssessment.copyright_notice_form_screening_id === null ||
      !currentAssessment.substantially_compliant)
  ) {
    await transaction.commit()
    return
  }
  const assessment =
    existingAssessments[0] ??
    (await appendCopyrightSubmissionAssessmentInTransaction(
      {
        submissionId,
        assessedAt: new Date(),
        currentUser: null,
        substantiallyCompliant: true,
        copyrightFormScreeningId: intake.screening_id,
        supersedesAssessmentId: currentAssessment?.id,
      },
      transaction,
    ))
  await transaction.commit()
  await processCopyrightEnforcementRequest(assessment.id)
}
