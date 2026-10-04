import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  appendCopyrightSubmissionAssessmentInTransaction,
  type AssessmentInput,
} from '../services/copyright-notices/compliance-assessment.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

/** Commit a normal writer after recovery took its pre-lock READ COMMITTED snapshot. */
export async function appendTestCopyrightAssessmentWhileRecoveryWaits<Result>(
  input: AssessmentInput,
  recover: () => Promise<Result>,
): Promise<Result> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* appendTestCopyrightAssessmentWhileRecoveryWaits:lock */
    SELECT submission.id FROM copyright_notice_submissions submission
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE submission.id = ${input.submissionId} FOR UPDATE OF notice, submission`)
  const processId = await getTestPostgresBackendProcessId(transaction)
  const pending = recover()
  void pending.catch(() => undefined)
  try {
    await waitForTestPostgresLockWaiter(processId, 'recoverMissingCopyrightDecisionAssessments')
    await appendCopyrightSubmissionAssessmentInTransaction(input, transaction)
    await transaction.commit()
  } catch (err) {
    await transaction.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}
