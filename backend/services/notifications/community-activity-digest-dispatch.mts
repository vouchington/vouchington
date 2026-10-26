import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getNotificationsWorkLimit } from './work-limits.mts'

type DigestCursorOptions = { query?: QueryExecutor }

/** The scheduled job initializes its durable boundary before admitting any window jobs. */
export async function prepareCommunityActivityDigestWindows(
  targetWindowStart: Date,
  { query = write }: DigestCursorOptions = {},
): Promise<{ windows: Array<{ windowStart: Date; windowEnd: Date }>; hasMore: boolean }> {
  const windowLimit = getNotificationsWorkLimit('community_digest_windows_per_run')
  await query(sql`/* prepareCommunityActivityDigestWindows:ensureCursor */
    INSERT INTO community_activity_digest_cursors (is_singleton, sent_through_at)
    VALUES (TRUE, ${targetWindowStart})
    ON CONFLICT (is_singleton) DO NOTHING`)
  const { rows } = await query<{ window_starts_at: Date; window_ends_at: Date }>(sql`
    /* prepareCommunityActivityDigestWindows */
    SELECT cursor.sent_through_at + step * INTERVAL '168 hours' AS window_starts_at,
      cursor.sent_through_at + (step + 1) * INTERVAL '168 hours' AS window_ends_at
    FROM community_activity_digest_cursors cursor
    CROSS JOIN generate_series(0, ${windowLimit}) step
    WHERE cursor.is_singleton
      AND cursor.sent_through_at + step * INTERVAL '168 hours' <= ${targetWindowStart}
    ORDER BY step
    LIMIT ${windowLimit + 1}`)
  return {
    windows: rows.slice(0, windowLimit).map(row => ({
      windowStart: row.window_starts_at,
      windowEnd: row.window_ends_at,
    })),
    hasMore: rows.length > windowLimit,
  }
}

/** A failed earlier window must never be skipped by a later window completing first. */
export async function advanceCommunityActivityDigestCursor(
  windowStart: Date,
  windowEnd: Date,
  { query = write }: DigestCursorOptions = {},
): Promise<boolean> {
  const { rowCount } = await query(sql`/* advanceCommunityActivityDigestCursor */
    UPDATE community_activity_digest_cursors
    SET sent_through_at = GREATEST(sent_through_at, ${windowEnd}::timestamptz)
    WHERE is_singleton AND sent_through_at = ${windowStart}::timestamptz
      AND ${windowEnd}::timestamptz = ${windowStart}::timestamptz + INTERVAL '168 hours'`)
  return rowCount === 1
}

export async function isCommunityActivityDigestWindowComplete(
  windowEnd: Date,
  { query = write }: DigestCursorOptions = {},
): Promise<boolean> {
  const { rows } = await query<{ complete: boolean }>(sql`
    /* isCommunityActivityDigestWindowComplete */
    SELECT sent_through_at >= ${windowEnd}::timestamptz AS complete
    FROM community_activity_digest_cursors WHERE is_singleton`)
  return rows[0]?.complete ?? false
}
