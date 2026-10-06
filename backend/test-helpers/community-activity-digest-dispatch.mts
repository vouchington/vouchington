import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'

const DIGEST_LOCK_NAMESPACE = 2_135_042
const DIGEST_LOCK_KEY = 1

export async function withTestCommunityActivityDigestLock<T>(run: () => Promise<T>): Promise<T> {
  const lock = await acquireTestPostgresAdvisoryLock({
    namespace: DIGEST_LOCK_NAMESPACE,
    key: DIGEST_LOCK_KEY,
    timeout: '20s',
  })
  try {
    return await run()
  } finally {
    await lock.release()
  }
}

export async function readNextTestCommunityActivityDigestWindowStart(): Promise<Date> {
  const { rows } = await write<{ window_starts_at: Date }>(sql`
    /* readNextTestCommunityActivityDigestWindowStart */
    SELECT COALESCE(
      max(window_starts_at) + INTERVAL '7 days',
      '2400-01-06T00:00:00.000Z'::timestamptz
    ) AS window_starts_at
    FROM community_activity_digest_work_items
  `)
  return rows[0]!.window_starts_at
}

export async function insertTestCommunityActivityDigestWorkItem(windowStart: Date): Promise<void> {
  await write(sql`
    /* insertTestCommunityActivityDigestWorkItem */
    INSERT INTO community_activity_digest_work_items (window_starts_at, window_ends_at)
    VALUES (${windowStart}, ${windowStart}::timestamptz + INTERVAL '7 days')
    ON CONFLICT (window_starts_at) DO NOTHING
  `)
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
