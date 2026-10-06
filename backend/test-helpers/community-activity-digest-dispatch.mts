import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function clearTestCommunityActivityDigestWorkItems(): Promise<void> {
  await write(sql`DELETE FROM community_activity_digest_work_items`)
}

export async function getTestCommunityActivityDigestWorkItems(): Promise<
  Array<{
    window_starts_at: Date
    window_ends_at: Date
    lease_token: string | null
    lease_expires_at: Date | null
    completed_at: Date | null
    attempt_count: number
  }>
> {
  const { rows } = await write<{
    window_starts_at: Date
    window_ends_at: Date
    lease_token: string | null
    lease_expires_at: Date | null
    completed_at: Date | null
    attempt_count: number
  }>(sql`
    SELECT window_starts_at, window_ends_at, lease_token, lease_expires_at, completed_at, attempt_count
    FROM community_activity_digest_work_items
    ORDER BY window_starts_at
  `)
  return rows
}

export async function expireTestCommunityActivityDigestWorkItemLease(
  windowStart: Date,
  leaseToken: string,
): Promise<void> {
  await write(sql`
    UPDATE community_activity_digest_work_items
    SET leased_at = clock_timestamp() - INTERVAL '2 seconds',
      lease_expires_at = clock_timestamp() - INTERVAL '1 second'
    WHERE window_starts_at = ${windowStart} AND lease_token = ${leaseToken}
  `)
}
