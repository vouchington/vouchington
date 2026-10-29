import type { AssessmentInput } from '../services/copyright-notices/types.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance-assessment.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

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
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: processId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'recoverMissingCopyrightDecisionAssessments',
      releaseHolder: () => transaction[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = recover()
      await waitForLock(pending)
      await appendCopyrightSubmissionAssessmentInTransaction(input, transaction)
      await transaction.commit()
      return pending
    },
  )
}
