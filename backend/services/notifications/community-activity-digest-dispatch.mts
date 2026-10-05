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
      SELECT max(window_starts_at) AS window_starts_at
      FROM community_activity_digest_dispatch_windows
    ), missing AS (
      SELECT generate_series(
        COALESCE((SELECT window_starts_at + INTERVAL '7 days' FROM latest), ${targetWindowStart}),
        ${targetWindowStart},
        INTERVAL '7 days'
      ) AS window_starts_at
    )
    INSERT INTO community_activity_digest_dispatch_windows (window_starts_at, window_ends_at)
    SELECT window_starts_at, window_starts_at + INTERVAL '7 days'
    FROM missing
    ORDER BY window_starts_at
    ON CONFLICT (window_starts_at) DO NOTHING
    RETURNING window_starts_at, window_ends_at
  `)
  const { rows: pending } = await write<{ window_starts_at: Date; window_ends_at: Date }>(sql`
    /* listPendingCommunityActivityDigestDispatchWindows */
    SELECT window_starts_at, window_ends_at
    FROM community_activity_digest_dispatch_windows
    WHERE completed_at IS NULL
      AND (enqueued_at IS NULL OR enqueued_at <= ${recoveryBefore})
      AND window_starts_at <= ${targetWindowStart}
    ORDER BY window_starts_at
  `)
  return pending.map(row => ({ windowStart: row.window_starts_at, windowEnd: row.window_ends_at }))
}

export async function markCommunityActivityDigestDispatchWindowEnqueued(
  windowStart: Date,
): Promise<void> {
  await write(sql`
    /* markCommunityActivityDigestDispatchWindowEnqueued */
    UPDATE community_activity_digest_dispatch_windows
    SET enqueued_at = CURRENT_TIMESTAMP
    WHERE window_starts_at = ${windowStart}
  `)
}

export async function refreshCommunityActivityDigestDispatchWindowActivity(
  windowStart: Date,
): Promise<void> {
  await write(sql`
    /* refreshCommunityActivityDigestDispatchWindowActivity */
    UPDATE community_activity_digest_dispatch_windows
    SET enqueued_at = CURRENT_TIMESTAMP
    WHERE window_starts_at = ${windowStart}
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
    WHERE window_starts_at = ${windowStart}
  `)
}
