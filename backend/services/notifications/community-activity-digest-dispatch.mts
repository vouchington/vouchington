import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS } from '@voucha/types/community-activity-digest'

export async function prepareCommunityActivityDigestDispatchWindows(
  targetWindowStart: Date,
  recoveryBefore = new Date(Date.now() - COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS),
): Promise<Array<{ windowStart: Date; windowEnd: Date }>> {
  await write(sql`
    /* prepareCommunityActivityDigestDispatchWindows */
    WITH latest AS (
      SELECT max(window_start) AS window_start
      FROM community_activity_digest_dispatch_windows
    ), missing AS (
      SELECT generate_series(
        COALESCE((SELECT window_start + INTERVAL '7 days' FROM latest), ${targetWindowStart}),
        ${targetWindowStart},
        INTERVAL '7 days'
      ) AS window_start
    )
    INSERT INTO community_activity_digest_dispatch_windows (window_start, window_end)
    SELECT window_start, window_start + INTERVAL '7 days'
    FROM missing
    ORDER BY window_start
    ON CONFLICT (window_start) DO NOTHING
    RETURNING window_start, window_end
  `)
  const { rows: pending } = await write<{ window_start: Date; window_end: Date }>(sql`
    /* listPendingCommunityActivityDigestDispatchWindows */
    SELECT window_start, window_end
    FROM community_activity_digest_dispatch_windows
    WHERE completed_at IS NULL
      AND (enqueued_at IS NULL OR enqueued_at <= ${recoveryBefore})
      AND window_start <= ${targetWindowStart}
    ORDER BY window_start
  `)
  return pending.map(row => ({ windowStart: row.window_start, windowEnd: row.window_end }))
}

export async function markCommunityActivityDigestDispatchWindowEnqueued(
  windowStart: Date,
): Promise<void> {
  await write(sql`
    /* markCommunityActivityDigestDispatchWindowEnqueued */
    UPDATE community_activity_digest_dispatch_windows
    SET enqueued_at = CURRENT_TIMESTAMP
    WHERE window_start = ${windowStart}
  `)
}

export async function refreshCommunityActivityDigestDispatchWindowActivity(
  windowStart: Date,
): Promise<void> {
  await write(sql`
    /* refreshCommunityActivityDigestDispatchWindowActivity */
    UPDATE community_activity_digest_dispatch_windows
    SET enqueued_at = CURRENT_TIMESTAMP
    WHERE window_start = ${windowStart}
      AND completed_at IS NULL
  `)
}

export async function markCommunityActivityDigestDispatchWindowCompleted(
  windowStart: Date,
): Promise<void> {
  await write(sql`
    /* markCommunityActivityDigestDispatchWindowCompleted */
    UPDATE community_activity_digest_dispatch_windows
    SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
    WHERE window_start = ${windowStart}
  `)
}
