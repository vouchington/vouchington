import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMembershipWorkLimit } from '../work-limits.mts'

export type PauseCollectionDispatch = {
  userId: string
  requestedAt: string
  leaseToken: string
}

type ClaimRow = { userId: string; requestedAt: Date; leaseToken: string }

/**
 * Claims due pause-collection work. Unleased rows and expired leases are separate
 * index-served claims so one signal cannot hide the other. The run cap is the
 * memberships pending-operations page size.
 */
export async function dispatchDuePauseCollectionWork(
  limit = getMembershipWorkLimit('pending_operations_page_size'),
): Promise<PauseCollectionDispatch[]> {
  const cap = limit
  const unleased = await claimUnleasedPauseCollection(cap)
  const remaining = cap - unleased.length
  const expired = remaining > 0 ? await claimExpiredPauseCollection(remaining) : []
  return [...unleased, ...expired].map(publish)
}

function publish(row: ClaimRow): PauseCollectionDispatch {
  return {
    userId: row.userId,
    requestedAt: row.requestedAt.toISOString(),
    leaseToken: row.leaseToken,
  }
}

async function claimUnleasedPauseCollection(limit: number): Promise<ClaimRow[]> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<ClaimRow>(sql`/* claimUnleasedPauseCollection */
    WITH due AS (
      SELECT user_id FROM membership_pause_collection_work_items
      WHERE lease_token IS NULL AND available_at <= clock_timestamp()
      ORDER BY available_at, user_id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE membership_pause_collection_work_items work
    SET lease_token = uuidv7(),
      leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + INTERVAL '5 minutes',
      attempt_count = attempt_count + 1
    FROM due
    WHERE work.user_id = due.user_id AND work.lease_token IS NULL
    RETURNING work.user_id AS "userId", work.requested_at AS "requestedAt",
      work.lease_token AS "leaseToken"
  `)
  await transaction.commit()
  return rows
}

async function claimExpiredPauseCollection(limit: number): Promise<ClaimRow[]> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<ClaimRow>(sql`/* claimExpiredPauseCollection */
    WITH due AS (
      SELECT user_id FROM membership_pause_collection_work_items
      WHERE lease_token IS NOT NULL AND lease_expires_at <= clock_timestamp()
      ORDER BY lease_expires_at, user_id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE membership_pause_collection_work_items work
    SET lease_token = uuidv7(),
      leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + INTERVAL '5 minutes',
      attempt_count = attempt_count + 1
    FROM due
    WHERE work.user_id = due.user_id
      AND work.lease_token IS NOT NULL
      AND work.lease_expires_at <= clock_timestamp()
    RETURNING work.user_id AS "userId", work.requested_at AS "requestedAt",
      work.lease_token AS "leaseToken"
  `)
  await transaction.commit()
  return rows
}
