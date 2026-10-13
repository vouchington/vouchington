import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { membershipPauseCollectionRetryDelayMs } from './retry-delay.mts'

export type PauseCollectionClaim = {
  leaseToken: string
  suspended: boolean
  attemptCount: number
}

/** Confirms a dispatcher lease still owns this generation. */
export async function confirmMembershipPauseCollectionLease(input: {
  userId: string
  requestedAt: string
  leaseToken: string
}): Promise<PauseCollectionClaim | null> {
  const { rows } = await write<PauseCollectionClaim>(
    sql`/* confirmMembershipPauseCollectionLease */
      SELECT work.lease_token AS "leaseToken",
        work.attempt_count AS "attemptCount",
        EXISTS (
          SELECT 1 FROM user_suspensions suspension
          WHERE suspension.user_id = work.user_id AND suspension.lifted_at IS NULL
        ) AS suspended
      FROM membership_pause_collection_work_items work
      WHERE work.user_id = ${input.userId}
        AND work.requested_at = ${input.requestedAt}::timestamptz
        AND work.lease_token = ${input.leaseToken}
    `,
  )
  return rows[0] ?? null
}

/** Claims an unleased or expired generation and reports the open suspension. */
export async function claimMembershipPauseCollection(input: {
  userId: string
  requestedAt: string
}): Promise<PauseCollectionClaim | null> {
  const { rows } = await write<PauseCollectionClaim>(
    sql`/* claimMembershipPauseCollection */
      WITH claimed AS (
        UPDATE membership_pause_collection_work_items
        SET lease_token = uuidv7(),
          leased_at = clock_timestamp(),
          lease_expires_at = clock_timestamp() + INTERVAL '5 minutes',
          attempt_count = attempt_count + 1
        WHERE user_id = ${input.userId}
          AND requested_at = ${input.requestedAt}::timestamptz
          AND (lease_token IS NULL OR lease_expires_at <= clock_timestamp())
        RETURNING user_id, lease_token, attempt_count
      )
      SELECT claimed.lease_token AS "leaseToken",
        claimed.attempt_count AS "attemptCount",
        EXISTS (
          SELECT 1 FROM user_suspensions suspension
          WHERE suspension.user_id = claimed.user_id AND suspension.lifted_at IS NULL
        ) AS suspended
      FROM claimed
    `,
  )
  return rows[0] ?? null
}

/** Re-reads the lease immediately before Stripe so a newer generation is not overwritten. */
export async function membershipPauseCollectionLeaseHeld(input: {
  userId: string
  requestedAt: string
  leaseToken: string
}): Promise<boolean> {
  const { rows } = await write<{ held: boolean }>(sql`/* membershipPauseCollectionLeaseHeld */
    SELECT true AS held
    FROM membership_pause_collection_work_items
    WHERE user_id = ${input.userId}
      AND requested_at = ${input.requestedAt}::timestamptz
      AND lease_token = ${input.leaseToken}
    LIMIT 1
  `)
  return rows.length > 0
}

/** Deletes the generation this lease applied. A newer generation leaves the row. */
export async function completeMembershipPauseCollection(input: {
  userId: string
  requestedAt: string
  leaseToken: string
}): Promise<boolean> {
  const { rowCount } = await write(sql`/* completeMembershipPauseCollection */
    DELETE FROM membership_pause_collection_work_items
    WHERE user_id = ${input.userId}
      AND requested_at = ${input.requestedAt}::timestamptz
      AND lease_token = ${input.leaseToken}
  `)
  return (rowCount ?? 0) > 0
}

/**
 * Clears this lease and delays the next dispatcher claim. A newer generation does not match.
 * There is no terminal give-up: the delay stays at the 24 hour ceiling.
 */
export async function scheduleMembershipPauseCollectionRetry(input: {
  userId: string
  requestedAt: string
  leaseToken: string
  attemptCount: number
  failureMessage: string
}): Promise<boolean> {
  const dueAt = new Date(Date.now() + membershipPauseCollectionRetryDelayMs(input.attemptCount))
  const { rowCount } = await write(sql`/* scheduleMembershipPauseCollectionRetry */
    UPDATE membership_pause_collection_work_items
    SET lease_token = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      available_at = ${dueAt},
      last_failed_at = clock_timestamp(),
      last_failure_message = ${input.failureMessage}
    WHERE user_id = ${input.userId}
      AND requested_at = ${input.requestedAt}::timestamptz
      AND lease_token = ${input.leaseToken}
  `)
  return (rowCount ?? 0) > 0
}
