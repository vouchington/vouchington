import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function clearTestCommunityActivityDigestDispatchWindows(): Promise<void> {
  await write(sql`DELETE FROM community_activity_digest_dispatch_windows`)
}

export async function getTestCommunityActivityDigestDispatchWindows(): Promise<
  Array<{
    window_starts_at: Date
    window_ends_at: Date
    enqueued_at: Date | null
    completed_at: Date | null
  }>
> {
  const { rows } = await write<{
    window_starts_at: Date
    window_ends_at: Date
    enqueued_at: Date | null
    completed_at: Date | null
  }>(sql`
    SELECT window_starts_at, window_ends_at, enqueued_at, completed_at
    FROM community_activity_digest_dispatch_windows
    ORDER BY window_starts_at
  `)
  return rows
}

export async function setTestCommunityActivityDigestDispatchWindowEnqueuedAt(
  windowStart: Date,
  enqueuedAt: Date,
): Promise<void> {
  await write(sql`
    UPDATE community_activity_digest_dispatch_windows
    SET enqueued_at = ${enqueuedAt}
    WHERE window_starts_at = ${windowStart}
  `)
}
