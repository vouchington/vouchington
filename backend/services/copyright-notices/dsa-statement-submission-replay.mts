import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { buildCopyrightDsaStatementPayload } from './dsa-statement-payload.mts'
import { getDsaStatementBuildFailureCode } from './dsa-statement-submission-build-failure.mts'
import {
  appendDsaStatementSubmissionAttempt,
  readDsaStatementSubmissionRound,
} from './dsa-statement-submission-ledger.mts'

type ReplayableSubmission = {
  submitted_at: Date | null
  failed_at: Date | null
  copyright_restriction_id: string
}

/**
 * Re-arms a dead-lettered round, or a payload build failure once its data can be built; older
 * attempt rows remain immutable. A build failure that still cannot be built returns false and
 * changes nothing.
 */
export async function replayDsaStatementSubmission(
  currentUserId: string,
  submissionId: string,
  buildPayload: typeof buildCopyrightDsaStatementPayload = buildCopyrightDsaStatementPayload,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<ReplayableSubmission>(
    sql`/* replayDsaStatementSubmission:lockSubmission */
    SELECT submitted_at, failed_at, copyright_restriction_id
    FROM copyright_dsa_statement_submissions
    WHERE id = ${submissionId} FOR UPDATE
  `,
  )
  const item = rows[0]
  if (!item || item.submitted_at) return false
  if (item.failed_at) {
    if (!(await rebuildFailedPayload(submissionId, item, buildPayload, transaction))) return false
  } else {
    const round = await readDsaStatementSubmissionRound(submissionId, transaction)
    if (!round.hasPermanentFailure && round.retryableFailures < 5) return false
  }
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
  await transaction(sql`/* replayDsaStatementSubmission:rearm */
    UPDATE copyright_dsa_statement_submissions
    SET available_at = CURRENT_TIMESTAMP
    WHERE id = ${submissionId}
  `)
  await transaction.commit()
  return true
}

/** Freezes the payload once the data is fixed; a still-failing builder HttpError leaves the row failed. */
async function rebuildFailedPayload(
  submissionId: string,
  item: ReplayableSubmission,
  buildPayload: typeof buildCopyrightDsaStatementPayload,
  transaction: TransactionQuery,
): Promise<boolean> {
  try {
    const payload = await buildPayload(item.copyright_restriction_id, transaction)
    await transaction(sql`/* replayDsaStatementSubmission:freezePayload */
      UPDATE copyright_dsa_statement_submissions
      SET payload = ${JSON.stringify(payload)}::jsonb, failed_at = NULL, failure_code = NULL
      WHERE id = ${submissionId}
    `)
    return true
  } catch (err) {
    if (!getDsaStatementBuildFailureCode(err)) throw err
    return false
  }
}
