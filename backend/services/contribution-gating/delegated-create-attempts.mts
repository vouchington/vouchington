import { beginTransaction, query } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDEMPOTENCY_KEY_REUSED } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'

/** How long an unfinished claim holds its key before a retry may take it over. */
export const DELEGATED_CREATE_LEASE_SECONDS = 60
const MAX_CLAIM_ATTEMPTS = 3

export type DelegatedCreateClaim =
  | { kind: 'claimed'; id: string }
  | { kind: 'replay'; response: Record<string, unknown> }
  | { kind: 'in_progress'; retryAfterSeconds: number }

type AttemptRow = {
  id: string
  intent_sha256: string
  response: Record<string, unknown> | null
  retry_after_seconds: number
}

/**
 * Binds the credential owner's idempotency key to one exact create request. A free key is claimed;
 * a completed one replays its stored response; a live claim asks the caller to retry; the same key
 * with a different request is rejected. An unfinished claim past its lease is taken over.
 */
export async function claimDelegatedCreate(
  userId: string,
  idempotencyKey: string,
  intentSha256: string,
  attemptsLeft = MAX_CLAIM_ATTEMPTS,
): Promise<DelegatedCreateClaim> {
  const claim = await tryClaim(userId, idempotencyKey, intentSha256)
  if (claim) return claim
  if (attemptsLeft <= 1) throw new Error('Delegated create attempt could not be claimed')
  return claimDelegatedCreate(userId, idempotencyKey, intentSha256, attemptsLeft - 1)
}

/** One claim transaction. Null means the row was released between the insert and the read. */
async function tryClaim(
  userId: string,
  idempotencyKey: string,
  intentSha256: string,
): Promise<DelegatedCreateClaim | null> {
  await using transaction = await beginTransaction()
  const inserted = await transaction<{ id: string }>(sql`/* claimDelegatedCreate.insert */
    INSERT INTO user_mcp_create_attempts (user_id, idempotency_key, intent_sha256)
    VALUES (${userId}, ${idempotencyKey}, ${intentSha256})
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
    RETURNING id`)
  if (inserted.rows[0]) {
    await transaction.commit()
    return { kind: 'claimed', id: inserted.rows[0].id }
  }
  const existing = await transaction<AttemptRow>(sql`/* claimDelegatedCreate.get */
    SELECT id, intent_sha256, response,
      CEIL(EXTRACT(EPOCH FROM claimed_at + ${DELEGATED_CREATE_LEASE_SECONDS} * INTERVAL '1 second'
        - clock_timestamp()))::int AS retry_after_seconds
    FROM user_mcp_create_attempts
    WHERE user_id = ${userId} AND idempotency_key = ${idempotencyKey}
    FOR UPDATE`)
  const row = existing.rows[0]
  if (!row) return null
  if (row.intent_sha256 !== intentSha256) {
    throw createCodedError(
      409,
      'This idempotency_key was already used for a different request.',
      IDEMPOTENCY_KEY_REUSED,
    )
  }
  if (row.response) return { kind: 'replay', response: row.response }
  if (row.retry_after_seconds > 0)
    return { kind: 'in_progress', retryAfterSeconds: row.retry_after_seconds }
  await transaction(sql`/* claimDelegatedCreate.takeOver */
    UPDATE user_mcp_create_attempts SET claimed_at = clock_timestamp() WHERE id = ${row.id}`)
  await transaction.commit()
  return { kind: 'claimed', id: row.id }
}

/** Stores the exact response the create returned so every retry of the key replays it. */
export async function completeDelegatedCreate(
  attemptId: string,
  response: Record<string, unknown>,
): Promise<void> {
  await query(sql`/* completeDelegatedCreate */
    UPDATE user_mcp_create_attempts
    SET response = ${JSON.stringify(response)}::jsonb, completed_at = clock_timestamp()
    WHERE id = ${attemptId} AND response IS NULL`)
}

/** Frees the key after a failed create so the caller may retry it. */
export async function releaseDelegatedCreate(attemptId: string): Promise<void> {
  await query(sql`/* releaseDelegatedCreate */
    DELETE FROM user_mcp_create_attempts WHERE id = ${attemptId} AND response IS NULL`)
}
