import { write } from '@data-stores/psql'
import { getMinUuidv7ForDate } from '@modules/utils/ids'
import pMap from 'p-map'
import sql from 'sql-template-strings'
import {
  MODERATION_TRANSPARENCY_DAY_MS,
  MODERATION_TRANSPARENCY_MINIMUM_COHORT_SIZE,
  getCompleteDailyCohortCutoff,
} from './sanitize-moderation-transparency.mts'
import { getModerationAnalyticsWorkLimit } from './work-limits.mts'

/**
 * Computes the cohorts of the closed UTC days in [start, end) from the source tables with one
 * GROUP BY and freezes each cohort of at least the minimum size. A released day never changes
 * (`DO NOTHING`), so a re-run, an overlapping lookback, or a concurrent run needs no lock.
 * A source row deleted before this runs is simply not counted. Returns the rows released.
 */
export async function releaseModerationTransparencyRange(start: Date, end: Date): Promise<number> {
  const lowerId = getMinUuidv7ForDate(start)
  const upperId = getMinUuidv7ForDate(end)
  const { rowCount } = await write(sql`/* releaseModerationTransparencyRange */
    INSERT INTO moderation_transparency_released_daily_rollups
      (day, community_id, metric, category, count, latest_occurred_at)
    SELECT (occurred_at AT TIME ZONE 'UTC')::date, community_id, metric, category,
      count(*)::integer, max(occurred_at)
    FROM (
      SELECT uuid_extract_timestamp(id) AS occurred_at, NULL::uuid AS community_id,
        'reports'::moderation_transparency_metrics AS metric,
        original_reason::text::moderation_transparency_categories AS category
      FROM moderation_reports
      WHERE id >= ${lowerId}::uuid AND id < ${upperId}::uuid
        AND moderation_transparency_community_id IS NULL
      UNION ALL
      SELECT uuid_extract_timestamp(id), NULL::uuid, 'moderation_actions',
        action_type::text::moderation_transparency_categories
      FROM moderator_actions
      WHERE id >= ${lowerId}::uuid AND id < ${upperId}::uuid
        AND moderation_transparency_community_id IS NULL
      UNION ALL
      SELECT uuid_extract_timestamp(id), moderation_transparency_community_id, 'automated_moderation',
        moderation_transparency_category
      -- no-mistakes-disable-next-line postgres-required-predicates: day cohort cannot name post_id; the UUIDv7 id range bounds the read to one closed UTC day
      FROM agent_moderations
      WHERE id >= ${lowerId}::uuid AND id < ${upperId}::uuid
        AND moderation_transparency_category IS NOT NULL
      UNION ALL
      SELECT uuid_extract_timestamp(change.id), change.moderation_transparency_community_id,
        'automated_moderation', category
      FROM post_clearance_changes change
      CROSS JOIN LATERAL unnest(change.moderation_transparency_categories) AS category
      WHERE change.id >= ${lowerId}::uuid AND change.id < ${upperId}::uuid
        AND change.change_type = 'reject'
      UNION ALL
      SELECT resolved_at, NULL::uuid, 'appeals',
        resolution_action::text::moderation_transparency_categories
      FROM moderation_appeals
      WHERE id < ${upperId}::uuid
        AND resolved_at >= ${start}::timestamptz AND resolved_at < ${end}::timestamptz
        AND moderation_transparency_community_id IS NULL
    ) events
    GROUP BY 1, 2, 3, 4
    HAVING count(*) >= ${MODERATION_TRANSPARENCY_MINIMUM_COHORT_SIZE}
    ORDER BY (occurred_at AT TIME ZONE 'UTC')::date ASC NULLS LAST, community_id ASC NULLS LAST,
      metric ASC NULLS LAST, category ASC NULLS LAST
    ON CONFLICT ON CONSTRAINT moderation_transparency_released_daily_rollups_key DO NOTHING
  `)
  return rowCount ?? 0
}

/**
 * Releases the newest closed UTC days, `batch_days` per statement, at most `max_batches_per_run`
 * statements and `lookback_days` days per run. The lookback only has to cover missed runs; a
 * smaller product of batch size and cap sheds the oldest days of the lookback.
 */
export async function releaseModerationTransparencyDays(
  now = new Date(),
): Promise<{ days: number; released: number }> {
  const batchDays = getModerationAnalyticsWorkLimit('transparency_release_batch_days')
  const lookbackDays = getModerationAnalyticsWorkLimit('transparency_release_lookback_days')
  const maxBatches = getModerationAnalyticsWorkLimit('transparency_release_max_batches_per_run')
  const days = Math.min(lookbackDays, batchDays * maxBatches)
  const end = getCompleteDailyCohortCutoff(now).getTime() + 1
  const ranges = Array.from({ length: Math.ceil(days / batchDays) }, (_, batch) => ({
    start: new Date(end - Math.min(days, (batch + 1) * batchDays) * MODERATION_TRANSPARENCY_DAY_MS),
    end: new Date(end - batch * batchDays * MODERATION_TRANSPARENCY_DAY_MS),
  }))
  const counts = await pMap(
    ranges,
    range => releaseModerationTransparencyRange(range.start, range.end),
    { concurrency: 1 },
  )
  return { days, released: counts.reduce((sum, count) => sum + count, 0) }
}
