import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** The identity and history row are one assessment creation step. */
async function createRecoveredCopyrightAssessmentHistory(
  transaction: TransactionQuery,
  noticeId: string,
  submissionId: string,
  reviewedAt: Date,
  reviewedById: string,
  previousAssessmentId: string | null,
): Promise<string> {
  const { rows: identityRows } = await transaction<{ id: string }>(sql`
    /* recoverRejectedCopyrightFormReviewEffect:identity */
    INSERT INTO copyright_notice_submission_assessment_identities (
      copyright_notice_id, copyright_notice_submission_id
    ) VALUES (${noticeId}, ${submissionId}) RETURNING id
  `)
  const assessmentId = identityRows[0]!.id
  const { rows: recoveredAssessment } = await transaction<{ id: string }>(sql`
    /* recoverRejectedCopyrightFormReviewEffect:assessment */
    INSERT INTO copyright_notice_submission_assessments (
      id, copyright_notice_submission_id, assessed_at, assessed_by_id,
      is_substantially_compliant, supersedes_assessment_id
    ) VALUES (
      ${assessmentId}, ${submissionId}, ${reviewedAt}, ${reviewedById}, false,
      ${previousAssessmentId}
    ) RETURNING id
  `)
  return recoveredAssessment[0]!.id
}

/** The current assessment and its lifecycle event must follow the history insert. */
async function recordRecoveredCopyrightAssessmentResult(
  transaction: TransactionQuery,
  noticeId: string,
  submissionId: string,
  assessmentId: string,
  reviewedAt: Date,
  reviewedById: string,
): Promise<void> {
  await transaction(sql`/* recoverRejectedCopyrightFormReviewEffect:current */
    UPDATE copyright_notice_submissions
    SET current_assessment_identity_id = ${assessmentId},
      current_assessment_is_substantially_compliant = false,
      current_assessed_at = ${reviewedAt},
      current_assessed_by_id = ${reviewedById},
      current_assessment_form_screening_id = NULL
    WHERE id = ${submissionId}
  `)
  await transaction(sql`/* recoverRejectedCopyrightFormReviewEffect:event */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_assessment_identity_id, recovery_source
    ) VALUES (
      ${noticeId}, 'submission_assessed', ${reviewedById},
      ${assessmentId}, 'durable_review'
    )
  `)
}

export async function persistRecoveredCopyrightAssessment(
  transaction: TransactionQuery,
  noticeId: string,
  submissionId: string,
  reviewedAt: Date,
  reviewedById: string,
  previousAssessmentId: string | null,
): Promise<string> {
  const assessmentId = await createRecoveredCopyrightAssessmentHistory(
    transaction,
    noticeId,
    submissionId,
    reviewedAt,
    reviewedById,
    previousAssessmentId,
  )
  await recordRecoveredCopyrightAssessmentResult(
    transaction,
    noticeId,
    submissionId,
    assessmentId,
    reviewedAt,
    reviewedById,
  )
  return assessmentId
}
