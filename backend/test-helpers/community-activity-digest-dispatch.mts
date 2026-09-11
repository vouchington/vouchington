import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function clearTestCommunityActivityDigestDispatchWindows(): Promise<void> {
  await write(sql`DELETE FROM community_activity_digest_dispatch_windows`)
}

export async function getTestCommunityActivityDigestDispatchWindows(): Promise<
  Array<{
    window_start: Date
    window_end: Date
    enqueued_at: Date | null
    completed_at: Date | null
  }>
> {
  const { rows } = await write<{
    window_start: Date
    window_end: Date
    enqueued_at: Date | null
    completed_at: Date | null
  }>(sql`
    SELECT window_start, window_end, enqueued_at, completed_at
    FROM community_activity_digest_dispatch_windows
    ORDER BY window_start
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
    WHERE window_start = ${windowStart}
  `)
}
