import { read, write } from '@data-stores/psql'

type TestOAuthExchangeAttemptOptions = {
  exchangeAttempts?: number
  exchangeClaimId?: string
  updatedAt?: Date
}

export async function seedTestOAuthExchangeAttempts(
  authorizationId: string,
  options: TestOAuthExchangeAttemptOptions,
): Promise<void> {
  const count = Math.max(options.exchangeAttempts ?? 0, options.exchangeClaimId ? 1 : 0)
  if (count === 0) return
  await write(
    `/* seedTestOAuthExchangeAttempts */ WITH attempts AS (
       INSERT INTO oauth_authorization_exchange_attempts (
         oauth_authorization_id, attempt_number, exchange_claim_id, started_at
       )
       SELECT $1, ordinal, CASE WHEN ordinal = $2 AND $3::uuid IS NOT NULL
         THEN $3::uuid ELSE uuidv7() END, $4
       FROM generate_series(1, $2::integer) ordinal
       RETURNING id, attempt_number
     )
     INSERT INTO oauth_authorization_exchange_attempt_results (
       oauth_authorization_exchange_attempt_id, failed_at
     )
     SELECT id, $4 FROM attempts
     WHERE attempt_number < $2 OR $3::uuid IS NULL`,
    [authorizationId, count, options.exchangeClaimId ?? null, options.updatedAt ?? new Date()],
  )
}

export async function getTestOAuthExchangeAttempts(authorizationId: string) {
  const { rows } = await read<{
    attempt_number: number
    exchange_claim_id: string
    failed_at: Date | null
    abandoned_at: Date | null
    completed_at: Date | null
  }>(
    `/* getTestOAuthExchangeAttempts */ SELECT attempt.attempt_number,
       attempt.exchange_claim_id, result.failed_at, result.abandoned_at, result.completed_at
     FROM oauth_authorization_exchange_attempts attempt
     LEFT JOIN oauth_authorization_exchange_attempt_results result
       ON result.oauth_authorization_exchange_attempt_id = attempt.id
     WHERE attempt.oauth_authorization_id = $1 ORDER BY attempt.attempt_number`,
    [authorizationId],
  )
  return rows
}

export async function rewriteTestOAuthExchangeAttempt(authorizationId: string): Promise<void> {
  await write(
    `/* rewriteTestOAuthExchangeAttempt */ UPDATE oauth_authorization_exchange_attempts
     SET started_at = clock_timestamp() WHERE oauth_authorization_id = $1`,
    [authorizationId],
  )
}
