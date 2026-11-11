import { v7 as uuidv7 } from 'uuid'
import type { TransactionQuery } from '@data-stores/psql/types'
import { runSequentially } from '@modules/utils/run-sequentially'
import createHttpError from 'http-errors'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { AssessmentInput, CopyrightNoticeSubmissionAssessmentRecord } from './types.mts'

/** The source identity, assessment and existing case activity commit as one legal record. */
export async function insertCopyrightSubmissionAssessment(
  input: AssessmentInput,
  noticeId: string,
  transaction: TransactionQuery,
): Promise<CopyrightNoticeSubmissionAssessmentRecord> {
  const assessmentId = uuidv7()
  await runSequentially([
    () =>
      transaction(sql`/* appendCopyrightSubmissionAssessment:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_assessment_identity_id)
    VALUES (${noticeId}, 'submission_assessed', ${input.currentUser?.id ?? null}, ${assessmentId})
  `).catch((err: unknown) => {
        if (
          (err as { constraint?: string } | null)?.constraint === 'copyright_assessment_active_case'
        )
          throw createHttpError(410, 'Copyright case evidence was erased', { cause: err })
        throw err
      }),
    () =>
      transaction(sql`
    /* appendCopyrightSubmissionAssessment:identity */
    INSERT INTO copyright_notice_submission_assessment_identities (id, copyright_notice_id, copyright_notice_submission_id)
    VALUES (${assessmentId}, ${noticeId}, ${input.submissionId})
  `),
  ])
  const { rows } = await transaction(sql`/* appendCopyrightSubmissionAssessment */
    INSERT INTO copyright_notice_submission_assessments (
      id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant,
      supersedes_assessment_id, copyright_notice_form_screening_id
    ) VALUES (
      ${assessmentId}, ${input.submissionId}, ${input.assessedAt}, ${input.currentUser?.id ?? null}, ${input.substantiallyCompliant},
      ${input.supersedesAssessmentId ?? null}, ${input.copyrightFormScreeningId ?? null}
    )
    RETURNING id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant,
      supersedes_assessment_id, copyright_notice_form_screening_id
  `)
  const assessment = rows[0] as CopyrightNoticeSubmissionAssessmentRecord | undefined
  assert(assessment, 500, 'Failed to append copyright submission assessment')
  return assessment
}
