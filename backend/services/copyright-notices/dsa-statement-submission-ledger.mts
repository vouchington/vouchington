import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type DsaStatementSubmissionOutcome =
  | 'submitted'
  | 'retryable_failure'
  | 'permanent_failure'
  | 'replayed'

export type DsaStatementRound = {
  attemptNumber: number
  retryableFailures: number
  hasPermanentFailure: boolean
}

export type DsaStatementAttemptInput = {
  submissionId: string
  outcome: DsaStatementSubmissionOutcome
  statusCode: number | null
  errorCode: string | null
  replayedById?: string
  leaseToken?: string
}

/** Reads the append-only ledger after its most recent replay row, after the item has been locked. */
export async function readDsaStatementSubmissionRound(
  submissionId: string,
  query: TransactionQuery,
): Promise<DsaStatementRound> {
  const { rows } = await query<DsaStatementRound>(sql`/* readDsaStatementSubmissionRound */
    SELECT
      COALESCE(MAX(attempt.attempt_number), 0)::integer AS "attemptNumber",
      COUNT(*) FILTER (WHERE attempt.outcome = 'retryable_failure')::integer AS "retryableFailures",
      COALESCE(BOOL_OR(attempt.outcome = 'permanent_failure'), false) AS "hasPermanentFailure"
    FROM copyright_dsa_statement_submission_attempts attempt
    WHERE attempt.copyright_dsa_statement_submission_id = ${submissionId}
      AND NOT EXISTS (
        SELECT 1
        FROM copyright_dsa_statement_submission_attempts replay
        WHERE replay.copyright_dsa_statement_submission_id = attempt.copyright_dsa_statement_submission_id
          AND replay.outcome = 'replayed'
          AND replay.attempt_number > attempt.attempt_number
      )
  `)
  return rows[0] ?? { attemptNumber: 0, retryableFailures: 0, hasPermanentFailure: false }
}

/** The global attempt number remains monotonic across replayed rounds. */
export async function nextDsaStatementAttemptNumber(
  submissionId: string,
  query: TransactionQuery,
): Promise<number> {
  const { rows } = await query<{ attempt_number: number }>(sql`/* nextDsaStatementAttemptNumber */
    SELECT COALESCE(MAX(attempt_number), 0)::integer + 1 AS attempt_number
    FROM copyright_dsa_statement_submission_attempts
    WHERE copyright_dsa_statement_submission_id = ${submissionId}
  `)
  return rows[0]?.attempt_number ?? 1
}

export async function appendDsaStatementSubmissionAttempt(
  attempt: DsaStatementAttemptInput,
  query: TransactionQuery,
): Promise<boolean> {
  const attemptNumber = await nextDsaStatementAttemptNumber(attempt.submissionId, query)
  const { rowCount } = await query(sql`/* appendDsaStatementSubmissionAttempt */
    INSERT INTO copyright_dsa_statement_submission_attempts (
      copyright_dsa_statement_submission_id, attempt_number, outcome, status_code, error_code,
      replayed_by_id
    ) SELECT ${attempt.submissionId}, ${attemptNumber}, ${attempt.outcome}, ${attempt.statusCode},
      ${attempt.errorCode}, ${attempt.replayedById ?? null}
    WHERE ${attempt.leaseToken ?? null}::uuid IS NULL OR EXISTS (
      SELECT 1 FROM copyright_dsa_statement_submissions submission
      WHERE submission.id = ${attempt.submissionId} AND submission.lease_token = ${attempt.leaseToken}
    )
  `)
  return rowCount === 1
}

export async function recordDsaStatementSubmissionResult(input: {
  submissionId: string
  leaseToken: string
  outcome: 'submitted' | 'retryable_failure' | 'permanent_failure'
  statusCode: number | null
  errorCode: string | null
  responseUuid?: string
}): Promise<{ recorded: boolean; deadLettered: boolean; retryableFailures: number }> {
  await using transaction = await beginTransaction()
  const { rows: itemRows } = await transaction<{
    id: string
    submitted_at: Date | null
  }>(sql`/* recordDsaStatementSubmissionResult:lock */
    SELECT id, submitted_at
    FROM copyright_dsa_statement_submissions
    WHERE id = ${input.submissionId} AND lease_token = ${input.leaseToken}
    FOR UPDATE
  `)
  const item = itemRows[0]
  if (!item || item.submitted_at)
    return { recorded: false, deadLettered: false, retryableFailures: 0 }

  const round = await readDsaStatementSubmissionRound(input.submissionId, transaction)
  const retryableFailures =
    round.retryableFailures + (input.outcome === 'retryable_failure' ? 1 : 0)
  const appended = await appendDsaStatementSubmissionAttempt(
    {
      submissionId: input.submissionId,
      outcome: input.outcome,
      statusCode: input.statusCode,
      errorCode: input.errorCode,
      leaseToken: input.leaseToken,
    },
    transaction,
  )
  if (!appended) return { recorded: false, deadLettered: false, retryableFailures }
  const deadLettered =
    input.outcome === 'permanent_failure' ||
    (input.outcome === 'retryable_failure' && retryableFailures >= 5)
  const availableInMinutes = Math.max(1, 2 ** (retryableFailures - 1))
  const { rows: updatedRows } = await transaction<{
    id: string
  }>(sql`/* recordDsaStatementSubmissionResult:update */
    UPDATE copyright_dsa_statement_submissions
    SET submitted_at = CASE WHEN ${input.outcome === 'submitted'} THEN CURRENT_TIMESTAMP ELSE submitted_at END,
      transparency_database_uuid = CASE WHEN ${input.outcome === 'submitted'} THEN ${input.responseUuid ?? null} ELSE transparency_database_uuid END,
      available_at = CASE WHEN ${input.outcome === 'retryable_failure'} AND ${!deadLettered}
        THEN CURRENT_TIMESTAMP + make_interval(mins => ${availableInMinutes}) ELSE available_at END,
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = ${input.submissionId} AND lease_token = ${input.leaseToken}
    RETURNING id
  `)
  if (updatedRows.length !== 1) return { recorded: false, deadLettered: false, retryableFailures }
  await transaction.commit()
  return { recorded: true, deadLettered, retryableFailures }
}
