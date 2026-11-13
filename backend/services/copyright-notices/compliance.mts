import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import { CONFLICT } from '@modules/on-error/error-codes'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { appendCopyrightSubmissionAssessmentInTransaction } from './compliance-assessment.mts'
import type { AssessmentInput, CopyrightNoticeSubmissionAssessmentRecord } from './types.mts'
export { appendCopyrightSubmissionAssessmentInTransaction } from './compliance-assessment.mts'

export async function appendCopyrightSubmissionAssessment(
  input: AssessmentInput,
): Promise<CopyrightNoticeSubmissionAssessmentRecord> {
  return conflictOnSerializationFailure(
    async () => {
      await using transaction = await beginTransaction({ serializable: true })
      await lockAssessmentForm(input.submissionId, transaction)
      const assessment = await appendCopyrightSubmissionAssessmentInTransaction(input, transaction)
      await transaction.commit()
      return assessment
    },
    'Conflicting copyright assessment',
    CONFLICT,
  )
}

export async function lockAssessmentForm(
  submissionId: string,
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  const { rows } = await transaction<{ id: string }>(sql`/* lockAssessmentForm */
    SELECT id FROM copyright_notice_form_intakes WHERE copyright_notice_submission_id = ${submissionId}
  `)
  if (rows[0])
    await transaction(sql`/* lockAssessmentForm:fence */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-form-review:${rows[0].id}`}, 0))
  `)
}
