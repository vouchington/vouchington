import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  appendDsaStatementSubmissionAttempt,
  readDsaStatementSubmissionRound,
} from './dsa-statement-submission-ledger.mts'

/** Re-arms only a dead-lettered round; older attempt rows remain immutable. */
export async function replayDsaStatementSubmission(
  currentUserId: string,
  submissionId: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ submitted_at: Date | null }>(sql`
    SELECT submitted_at FROM copyright_dsa_statement_submissions
    WHERE id = ${submissionId} FOR UPDATE
  `)
  if (!rows[0] || rows[0].submitted_at) return false
  const round = await readDsaStatementSubmissionRound(submissionId, transaction)
  if (!round.hasPermanentFailure && round.retryableFailures < 5) return false
  const appended = await appendDsaStatementSubmissionAttempt(
    {
      submissionId,
      outcome: 'replayed',
      statusCode: null,
      errorCode: null,
      replayedById: currentUserId,
    },
    transaction,
  )
  if (!appended) throw new Error('Could not append DSA statement replay')
  await transaction(sql`
    UPDATE copyright_dsa_statement_submissions
    SET available_at = CURRENT_TIMESTAMP
    WHERE id = ${submissionId}
  `)
  await transaction.commit()
  return true
}
