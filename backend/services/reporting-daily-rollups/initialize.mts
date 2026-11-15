import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'

/** Indexed first rows prove intervening source days empty, including the gap after the sentinel user. */
export async function findNextReportingSourceDay(
  kind: 'growth' | 'moderator_workload',
  notBefore: Date,
  query: TransactionQuery,
): Promise<string> {
  const firstId = getMinUUIDv7ForDate(notBefore)
  const { rows } =
    kind === 'growth'
      ? await query<{ day: string }>(sql`/* nextGrowthSourceDay */
      SELECT LEAST((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
        COALESCE((SELECT (created_at AT TIME ZONE 'UTC')::date FROM users WHERE id >= ${firstId} ORDER BY id LIMIT 1), 'infinity'::date),
        COALESCE((SELECT (created_at AT TIME ZONE 'UTC')::date FROM posts WHERE id >= ${firstId} ORDER BY id LIMIT 1), 'infinity'::date),
        COALESCE((SELECT (created_at AT TIME ZONE 'UTC')::date
          -- no-mistakes-disable-next-line postgres-required-predicates: counts votes cast in a time window, which span every target post_id partition.
          FROM post_votes WHERE id >= ${firstId} ORDER BY id LIMIT 1), 'infinity'::date),
        COALESCE((SELECT day FROM post_vote_retained_daily_counts WHERE day >= ${notBefore.toISOString().slice(0, 10)}::date ORDER BY day LIMIT 1), 'infinity'::date),
        COALESCE((SELECT (created_at AT TIME ZONE 'UTC')::date FROM relation__user__follow__user WHERE created_at >= ${notBefore} ORDER BY created_at, subject_id, object_id LIMIT 1), 'infinity'::date))::text AS day
    `)
      : await query<{ day: string }>(sql`/* nextModeratorWorkloadSourceDay */
      SELECT LEAST((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
        COALESCE((SELECT (created_at AT TIME ZONE 'UTC')::date FROM moderator_actions WHERE id >= ${firstId} ORDER BY id LIMIT 1), 'infinity'::date))::text AS day
    `)
  return rows[0]!.day
}

export async function initializeReportingRollupCursors(query: TransactionQuery) {
  const { rows } = await query<{
    kind: 'growth' | 'moderator_workload'
  }>(sql`/* reportingCursorsPresent */
    SELECT kind FROM reporting_daily_rollup_cursors WHERE kind IN ('growth', 'moderator_workload')
  `)
  if (!rows.some(row => row.kind === 'growth')) await initializeCursor('growth', query)
  if (!rows.some(row => row.kind === 'moderator_workload'))
    await initializeCursor('moderator_workload', query)
}

async function initializeCursor(kind: 'growth' | 'moderator_workload', query: TransactionQuery) {
  const day = await findNextReportingSourceDay(kind, new Date(0), query)
  await query(sql`/* initializeReportingRollupCursor */
    INSERT INTO reporting_daily_rollup_cursors(kind, cursor_rollup_on) VALUES (${kind}, ${day}::date)
    ON CONFLICT (kind) DO NOTHING
  `)
}
