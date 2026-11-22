import { beginTransaction } from '@data-stores/psql'
import { lockCopyrightActionGenerationForSubmission } from './action-delivery-generation.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from './compliance-assessment.mts'
import type { AssessmentInput, CopyrightNoticeSubmissionAssessmentRecord } from './types.mts'
export { appendCopyrightSubmissionAssessmentInTransaction } from './compliance-assessment.mts'

export async function appendCopyrightSubmissionAssessment(
  input: AssessmentInput,
): Promise<CopyrightNoticeSubmissionAssessmentRecord> {
  await using transaction = await beginTransaction()
  const locked = await lockCopyrightActionGenerationForSubmission(input.submissionId, transaction)
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
    input,
    transaction,
    locked,
  )
  await transaction.commit()
  return assessment
}
