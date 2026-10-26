import { write, type QueryExecutor } from '@data-stores/psql'
import { randomUUID } from 'node:crypto'
import { v7 } from 'uuid'

export type DistributionExpirationState = {
  activity_id: string
  cursor_remote_actor_id: string | null
  completed_at: Date | null
  lease_token: string | null
  leased_at: Date | null
  lease_expires_at: Date | null
  attempt_count: number
}

export async function insertUnfinishedDistributionForTest(
  activityId: string,
  sourceUserId: string,
) {
  const cursor = randomUUID()
  const lease = randomUUID()
  await write(
    `/* insertUnfinishedDistributionExpirationForTest */
     INSERT INTO activitypub_distribution_work_items
       (activity_id, source_user_id, cursor_remote_actor_id, lease_token, leased_at,
        lease_expires_at, attempt_count)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, clock_timestamp(),
       clock_timestamp() + INTERVAL '10 minutes', 3)`,
    [activityId, sourceUserId, cursor, lease],
  )
  return { cursor, lease }
}

export async function readDistributionExpirationStateForTest(
  activityId: string,
  query: QueryExecutor = write,
): Promise<DistributionExpirationState | null> {
  const { rows } = await query<DistributionExpirationState>(
    `/* readDistributionExpirationStateForTest */
     SELECT activity_id, cursor_remote_actor_id, completed_at, lease_token, leased_at,
       lease_expires_at, attempt_count
     FROM activitypub_distribution_work_items WHERE activity_id = $1::uuid`,
    [activityId],
  )
  return rows[0] ?? null
}

export function createDistributionActivityIdForTest(createdAt = new Date()): string {
  return v7({ msecs: createdAt.getTime() })
}
