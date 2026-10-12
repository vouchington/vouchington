import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type PauseCollectionClaim = {
  leaseToken: string
  suspended: boolean
}

/** Confirms a dispatcher lease still owns this generation. */
export async function confirmMembershipPauseCollectionLease(input: {
  userId: string
  requestedAt: string
  leaseToken: string
}): Promise<PauseCollectionClaim | null> {
  const { rows } = await read<{ leaseToken: string; suspended: boolean }>(
    sql`/* confirmMembershipPauseCollectionLease */
      SELECT work.lease_token AS "leaseToken",
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
  const { rows } = await write<{ leaseToken: string; suspended: boolean }>(
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
        RETURNING user_id, lease_token
      )
      SELECT claimed.lease_token AS "leaseToken",
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
  const { rows } = await read<{ held: boolean }>(sql`/* membershipPauseCollectionLeaseHeld */
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

/** Drops only this lease so a retry or the dispatcher can claim the same generation. */
export async function releaseMembershipPauseCollection(input: {
  userId: string
  requestedAt: string
  leaseToken: string
}): Promise<void> {
  await write(sql`/* releaseMembershipPauseCollection */
    UPDATE membership_pause_collection_work_items
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE user_id = ${input.userId}
      AND requested_at = ${input.requestedAt}::timestamptz
      AND lease_token = ${input.leaseToken}
  `)
}
