import { getNotificationsWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS } from '@voucha/types/community-activity-digest'

export async function prepareCommunityActivityDigestWorkItems(
  targetWindowStart: Date,
  windowStarts?: readonly Date[],
): Promise<{ windows: Array<{ windowStart: Date; windowEnd: Date }>; hasMore: boolean }> {
  if (windowStarts?.length === 0) return { windows: [], hasMore: false }
  const windowLimit = getNotificationsWorkLimit('community_digest_window_batch_size')
  const { rows: created } = await write<{ window_starts_at: Date }>(sql`
    /* prepareCommunityActivityDigestWorkItems */
    WITH latest AS (
      SELECT max(window_starts_at) AS window_starts_at
      FROM community_activity_digest_work_items
    ), missing AS (
      SELECT COALESCE((SELECT window_starts_at + INTERVAL '7 days' FROM latest), ${targetWindowStart})
        + step * INTERVAL '7 days' AS window_starts_at
      FROM generate_series(0, ${windowLimit} - 1) AS step
    )
    INSERT INTO community_activity_digest_work_items (window_starts_at, window_ends_at)
    SELECT window_starts_at, window_starts_at + INTERVAL '7 days'
    FROM missing
    WHERE window_starts_at <= ${targetWindowStart}
    ORDER BY window_starts_at
    ON CONFLICT (window_starts_at) DO NOTHING
    RETURNING window_starts_at, window_ends_at
  `)
  const ownedStarts = windowStarts?.map(start => start.toISOString()) ?? null
  const { rows: pending } = await write<{ window_starts_at: Date; window_ends_at: Date }>(sql`
    /* listPendingCommunityActivityDigestDispatchWindows */
    SELECT window_starts_at, window_ends_at
    FROM community_activity_digest_work_items
    WHERE completed_at IS NULL
      AND available_at <= clock_timestamp()
      AND (lease_token IS NULL OR lease_expires_at <= clock_timestamp())
      AND window_starts_at <= ${targetWindowStart}
      AND (
        ${ownedStarts}::timestamptz[] IS NULL
        OR window_starts_at = ANY(${ownedStarts}::timestamptz[])
      )
    ORDER BY window_starts_at
    LIMIT ${windowLimit + 1}
  `)
  const lastCreated = created.at(-1)?.window_starts_at
  return {
    windows: pending
      .slice(0, windowLimit)
      .map(row => ({ windowStart: row.window_starts_at, windowEnd: row.window_ends_at })),
    hasMore:
      pending.length > windowLimit ||
      (created.length === windowLimit && !!lastCreated && lastCreated < targetWindowStart),
  }
}

export async function claimCommunityActivityDigestWorkItem(
  windowStart: Date,
): Promise<string | null> {
  const leaseToken = randomUUID()
  const { rows } = await write<{ lease_token: string }>(sql`
    /* claimCommunityActivityDigestWorkItem */
    UPDATE community_activity_digest_work_items
    SET lease_token = ${leaseToken}, leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS} * INTERVAL '1 millisecond',
      attempt_count = attempt_count + 1
    WHERE window_starts_at = ${windowStart} AND completed_at IS NULL
      AND available_at <= clock_timestamp()
      AND (lease_token IS NULL OR lease_expires_at <= clock_timestamp())
    RETURNING lease_token
  `)
  return rows[0]?.lease_token ?? null
}

export async function releaseCommunityActivityDigestWorkItem(
  windowStart: Date,
  leaseToken: string,
): Promise<void> {
  await write(sql`
    /* releaseCommunityActivityDigestWorkItem */
    UPDATE community_activity_digest_work_items
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE window_starts_at = ${windowStart} AND lease_token = ${leaseToken}
      AND completed_at IS NULL
  `)
}

export async function renewCommunityActivityDigestWorkItem(
  windowStart: Date,
  leaseToken: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`
    /* renewCommunityActivityDigestWorkItem */
    UPDATE community_activity_digest_work_items
    SET lease_expires_at = clock_timestamp() + ${COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS} * INTERVAL '1 millisecond'
    WHERE window_starts_at = ${windowStart} AND lease_token = ${leaseToken}
      AND lease_expires_at > clock_timestamp() AND completed_at IS NULL
  `)
  return rowCount === 1
}

export async function completeCommunityActivityDigestWorkItem(
  windowStart: Date,
  leaseToken: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`
    /* completeCommunityActivityDigestWorkItem */
    UPDATE community_activity_digest_work_items
    SET completed_at = clock_timestamp(), lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE window_starts_at = ${windowStart} AND lease_token = ${leaseToken}
      AND lease_expires_at > clock_timestamp() AND completed_at IS NULL
  `)
  return rowCount === 1
}
