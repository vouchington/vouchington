import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { DsaStatementPayload } from './dsa-statement-payload.mts'
import {
  appendDsaStatementSubmissionAttempt,
  readDsaStatementSubmissionRound,
} from './dsa-statement-submission-ledger.mts'

export type ClaimedDsaStatementSubmission = {
  submissionId: string
  leaseToken: string
  payload: DsaStatementPayload
  imposedAt: Date
}

export type DsaStatementSubmissionClaim =
  | { kind: 'claimed'; submission: ClaimedDsaStatementSubmission }
  | { kind: 'not_claimable' }
  | { kind: 'lease_expired'; deadLettered: true; retryableFailures: number }
  | { kind: 'dead_lettered'; retryableFailures: number }

/** Locks the item before rereading its ledger so a waiter sees the preceding owner's committed try. */
export async function claimDsaStatementSubmission(
  submissionId: string,
  from: Date,
): Promise<DsaStatementSubmissionClaim> {
  await using transaction = await beginTransaction()
  const item = await lockDsaStatementSubmission(submissionId, from, transaction)
  if (!item || item.submitted_at) {
    return { kind: 'not_claimable' }
  }

  const round = await readDsaStatementSubmissionRound(submissionId, transaction)
  if (round.hasPermanentFailure || round.retryableFailures >= 5) {
    return { kind: 'dead_lettered', retryableFailures: round.retryableFailures }
  }

  if (item.lease_token) {
    if (!item.lease_expired) return { kind: 'not_claimable' }
    const retryableFailures = round.retryableFailures + 1
    const deadLettered = retryableFailures >= 5
    const appended = await appendDsaStatementSubmissionAttempt(
      {
        submissionId,
        outcome: 'retryable_failure',
        statusCode: null,
        errorCode: 'lease_expired',
        leaseToken: item.lease_token,
      },
      transaction,
    )
    if (!appended) return { kind: 'not_claimable' }
    await transaction(sql`/* claimDsaStatementSubmission:expireLease */
      UPDATE copyright_dsa_statement_submissions
      SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
      WHERE id = ${submissionId} AND lease_token = ${item.lease_token}
    `)
    if (deadLettered) {
      await transaction.commit()
      return { kind: 'lease_expired', deadLettered: true, retryableFailures }
    }
  }

  if (!item.available_now) return { kind: 'not_claimable' }
  const { rows } = await transaction<{
    lease_token: string
  }>(sql`/* claimDsaStatementSubmission:lease */
    UPDATE copyright_dsa_statement_submissions
    SET lease_token = uuidv7(), leased_at = CURRENT_TIMESTAMP,
      lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes'
    WHERE id = ${submissionId} AND lease_token IS NULL AND submitted_at IS NULL
    RETURNING lease_token::text
  `)
  const leaseToken = rows[0]?.lease_token
  if (!leaseToken) return { kind: 'not_claimable' }
  await transaction.commit()
  return {
    kind: 'claimed',
    submission: { submissionId, leaseToken, payload: item.payload, imposedAt: item.imposed_at },
  }
}

type LockedSubmission = {
  id: string
  payload: DsaStatementPayload
  lease_token: string | null
  submitted_at: Date | null
  imposed_at: Date
  lease_expired: boolean
  available_now: boolean
}

async function lockDsaStatementSubmission(
  submissionId: string,
  from: Date,
  transaction: TransactionQuery,
): Promise<LockedSubmission | null> {
  const { rows } = await transaction<LockedSubmission>(sql`/* lockDsaStatementSubmission */
    SELECT submission.id, submission.payload, submission.lease_token::text,
      submission.submitted_at, restriction.imposed_at,
      submission.lease_token IS NOT NULL AND submission.lease_expires_at <= CURRENT_TIMESTAMP AS lease_expired,
      submission.available_at <= CURRENT_TIMESTAMP AS available_now
    FROM copyright_dsa_statement_submissions submission
    JOIN copyright_restrictions restriction
      ON restriction.id = submission.copyright_restriction_id
    WHERE submission.id = ${submissionId} AND submission.failed_at IS NULL
      AND restriction.imposed_at >= ${from}
    FOR UPDATE OF submission
  `)
  return rows[0] ?? null
}
