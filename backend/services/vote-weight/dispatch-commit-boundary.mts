import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Activity is bounded by server connections; sample outside a caller's cached transaction stats. */
export async function getVoteWeightFamilyCommitBoundary(now: Date): Promise<string> {
  // Capture the database clock before sampling activity. A transaction starting during the
  // sample is then newer than this boundary, even if it is absent from the activity snapshot.
  const clock = await write<{ at: string }>(
    '/* getVoteWeightFamilyCommitBoundary:clock */ SELECT clock_timestamp()::text AS at',
  )
  const at = clock.rows[0]?.at
  if (!at) throw new Error('Vote-weight family dispatch could not read the writer clock')
  const { rows } = await write<{ window_end: string; visible: boolean }>(
    sql`/* getVoteWeightFamilyCommitBoundary */
      SELECT (LEAST(${now}::timestamptz, ${at}::timestamptz,
          COALESCE(min(xact_start) FILTER (WHERE pid <> pg_backend_pid()), 'infinity'::timestamptz))
        - INTERVAL '1 microsecond')::text AS window_end,
        current_setting('track_activities')::boolean AND COALESCE(bool_and(
          (state IS NOT NULL AND state <> 'disabled') OR NOT has_any_column_privilege(usesysid,
            'membership_source_states', 'UPDATE')), true) AS visible
      FROM pg_stat_activity
      WHERE datname = current_database() AND usesysid IS NOT NULL`,
  )
  const boundary = rows[0]
  if (!boundary?.visible)
    throw new Error('Vote-weight family dispatch requires visible writer transaction activity')
  return boundary.window_end
}
