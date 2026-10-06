import { beginTransaction, query } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDEMPOTENCY_KEY_REUSED } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'

/** How long an unfinished claim holds its key before a retry may take it over. */
export const DELEGATED_CREATE_LEASE_SECONDS = 60

/** A holder's claim on one key. The token is rotated on every takeover, so a stale one is inert. */
export type DelegatedCreateLease = { id: string; leaseToken: string }

export type DelegatedCreateClaim =
  | ({ kind: 'claimed' } & DelegatedCreateLease)
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
): Promise<DelegatedCreateClaim> {
  // A retry means a concurrent release freed the key between the two statements, so the next
  // insert claims it. Another round needs yet another release in that same window.
  const claim = await tryClaim(userId, idempotencyKey, intentSha256)
  return claim ?? claimDelegatedCreate(userId, idempotencyKey, intentSha256)
}

/** One claim transaction. Null means the row was released between the insert and the read. */
async function tryClaim(
  userId: string,
  idempotencyKey: string,
  intentSha256: string,
): Promise<DelegatedCreateClaim | null> {
  await using transaction = await beginTransaction()
  const inserted = await transaction<{
    id: string
    lease_token: string
  }>(sql`/* claimDelegatedCreate.insert */
    INSERT INTO user_mcp_create_attempts (user_id, idempotency_key, intent_sha256)
    VALUES (${userId}, ${idempotencyKey}, ${intentSha256})
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
    RETURNING id, lease_token`)
  if (inserted.rows[0]) {
    await transaction.commit()
    return { kind: 'claimed', id: inserted.rows[0].id, leaseToken: inserted.rows[0].lease_token }
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
  const takenOver = await transaction<{ lease_token: string }>(
    sql`/* claimDelegatedCreate.takeOver */
    UPDATE user_mcp_create_attempts
    SET claimed_at = clock_timestamp(), lease_token = uuidv7()
    WHERE id = ${row.id}
    RETURNING lease_token`,
  )
  await transaction.commit()
  return { kind: 'claimed', id: row.id, leaseToken: takenOver.rows[0]!.lease_token }
}

/**
 * Stores the exact response the create returned so every retry of the key replays it. A holder
 * whose lease was taken over matches no row, so it cannot overwrite the newer holder's result.
 */
export async function completeDelegatedCreate(
  lease: DelegatedCreateLease,
  response: Record<string, unknown>,
): Promise<void> {
  await query(sql`/* completeDelegatedCreate */
    UPDATE user_mcp_create_attempts
    SET response = ${JSON.stringify(response)}::jsonb, completed_at = clock_timestamp()
    WHERE id = ${lease.id} AND lease_token = ${lease.leaseToken} AND response IS NULL`)
}

/**
 * Frees the key after a failed create so the caller may retry it. A holder whose lease was taken
 * over matches no row, so it cannot free the newer holder's claim.
 */
export async function releaseDelegatedCreate(lease: DelegatedCreateLease): Promise<void> {
  await query(sql`/* releaseDelegatedCreate */
    DELETE FROM user_mcp_create_attempts
    WHERE id = ${lease.id} AND lease_token = ${lease.leaseToken} AND response IS NULL`)
}
