import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getReportingWindows } from '@services/reporting-daily-rollups/windows'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCommunityId } from './moderation-analytics-scope.mts'
import {
  BAN_EVASION_SYSTEM_USERNAME,
  MODERATION_SYSTEM_USERNAME,
  RSS_FEED_AUTO_UPDATER_USERNAME,
} from '@services/users/constants'
import { MODERATION_ANALYTICS_ACTION_TYPES } from './moderation-action-types.mts'
import { getModerationAnalyticsWorkLimit } from './work-limits.mts'
import type { ModerationAnalyticsScope, ModeratorWorkloadMetrics } from './types.mts'

export async function getModeratorWorkload(
  periodStart: Date,
  scope: ModerationAnalyticsScope,
  now = new Date(),
): Promise<ModeratorWorkloadMetrics> {
  const communityId = getCommunityId(scope)
  const windows = getReportingWindows(periodStart, now)
  const partialStart = getMinUUIDv7ForDate(windows.firstPartial?.start ?? windows.today.start)
  const partialEnd = getMinUUIDv7ForDate(windows.firstPartial?.end ?? windows.today.start)
  const todayStart = getMinUUIDv7ForDate(windows.today.start)
  const { rows } = await read(sql`/* getModerationModeratorWorkload */
    WITH facts AS (
      SELECT ma.actor_user_id, ma.action_type::TEXT AS action_type,
        (ma.created_at AT TIME ZONE 'UTC')::DATE AS day,
        COUNT(*) AS count
      FROM moderator_actions ma
      JOIN users u ON u.id = ma.actor_user_id
      WHERE ((ma.id >= ${partialStart}::uuid AND ma.id < ${partialEnd}::uuid)
        OR ma.id >= ${todayStart}::uuid)
        AND ma.action_type = ANY(${MODERATION_ANALYTICS_ACTION_TYPES}::moderator_action_types[])
        AND (u.username IS NULL OR u.username NOT IN (${MODERATION_SYSTEM_USERNAME}, ${BAN_EVASION_SYSTEM_USERNAME}, ${RSS_FEED_AUTO_UPDATER_USERNAME}))
        AND (${communityId}::uuid IS NULL OR ma.community_id = ${communityId}::uuid)
      GROUP BY ma.actor_user_id, ma.action_type, day
      UNION ALL
      SELECT totals.actor_user_id, totals.action_type::TEXT, totals.day, totals.count
      FROM moderator_workload_daily_totals totals
      JOIN users u ON u.id = totals.actor_user_id
      WHERE totals.day >= ${windows.completed.start.toISOString().slice(0, 10)}::date
        AND totals.day < ${windows.completed.end.toISOString().slice(0, 10)}::date
        AND totals.community_id IS NOT DISTINCT FROM ${communityId}::uuid
        AND totals.action_type = ANY(${MODERATION_ANALYTICS_ACTION_TYPES}::moderator_action_types[])
        AND (u.username IS NULL OR u.username NOT IN (${MODERATION_SYSTEM_USERNAME}, ${BAN_EVASION_SYSTEM_USERNAME}, ${RSS_FEED_AUTO_UPDATER_USERNAME}))
    ), actor_totals AS (
      SELECT actor_user_id, SUM(count)::INT AS total
      FROM facts
      GROUP BY actor_user_id
      ORDER BY total DESC, actor_user_id ASC
      LIMIT ${getModerationAnalyticsWorkLimit('leaderboard_page_size')}
    ), selected AS (
      SELECT facts.* FROM facts JOIN actor_totals USING (actor_user_id)
    ), actor_counts AS (
      SELECT actor_user_id, json_object_agg(action_type, count ORDER BY action_type) AS counts
      FROM (
        SELECT actor_user_id, action_type, SUM(count)::INT AS count
        FROM selected GROUP BY actor_user_id, action_type
      ) counts
      GROUP BY actor_user_id
    ), weekly AS (
      SELECT actor_user_id, date_trunc('week', day)::DATE AS week, action_type,
        SUM(count)::INT AS count
      FROM selected GROUP BY actor_user_id, week, action_type
    ), weekly_json AS (
      SELECT actor_user_id,
        json_agg(json_build_object('date', week::TEXT, 'type', action_type, 'count', count)
          ORDER BY week ASC, action_type ASC) AS weekly_counts
      FROM weekly GROUP BY actor_user_id
    )
    SELECT COALESCE(json_agg(json_build_object(
      'actor_user_id', totals.actor_user_id,
      'total', totals.total,
      'counts', counts.counts,
      'weekly_counts', weekly.weekly_counts
    ) ORDER BY totals.total DESC, totals.actor_user_id ASC), '[]'::json) AS moderators
    FROM actor_totals totals
    JOIN actor_counts counts USING (actor_user_id)
    JOIN weekly_json weekly USING (actor_user_id)
  `)
  return {
    moderators: (rows[0]!.moderators as ModeratorWorkloadMetrics['moderators']) ?? [],
    users: {},
  }
}
