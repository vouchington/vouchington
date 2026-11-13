import type { AssessmentInput } from '../services/copyright-notices/types.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance-assessment.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** Commit the real RC writer after recovery reaches its owned submission wait, or aborts early. */
export async function appendTestCopyrightAssessmentWhileRecoveryWaits<Result>(
  input: AssessmentInput,
  recover: () => Promise<Result>,
  queryMarker = 'recoverMissingCopyrightDecisionAssessments',
): Promise<Result> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* appendTestCopyrightAssessmentWhileRecoveryWaits:lock */
    SELECT submission.id FROM copyright_notice_submissions submission
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE submission.id = ${input.submissionId} FOR UPDATE OF submission`)
  const processId = await getTestPostgresBackendProcessId(transaction)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: processId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker,
      releaseHolder: () => transaction[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = recover()
      try {
        await waitForLock(pending)
      } catch (err) {
        if ((err as { code?: string } | null)?.code !== '40001') throw err
        // A real early job abort must not skip the independently callable writer.
      }
      await appendCopyrightSubmissionAssessmentInTransaction(input, transaction)
      await transaction.commit()
      return pending
    },
  )
}
