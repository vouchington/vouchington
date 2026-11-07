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
  periodStartUuid: string,
  scope: ModerationAnalyticsScope,
): Promise<ModeratorWorkloadMetrics> {
  const leaderboardPageSize = getModerationAnalyticsWorkLimit('leaderboard_page_size')
  const communityId = getCommunityId(scope)
  const { rows } = await read(sql`/* getModerationModeratorWorkload */
    WITH actions AS (
      SELECT
        ma.actor_user_id,
        ma.action_type::TEXT AS action_type,
        uuid_extract_timestamp(ma.id) AS created_at
      FROM moderator_actions ma
      JOIN users u ON u.id = ma.actor_user_id
      WHERE ma.id >= ${periodStartUuid}::uuid
        AND ma.actor_user_id IS NOT NULL
        AND ma.action_type = ANY(${MODERATION_ANALYTICS_ACTION_TYPES}::moderator_action_types[])
        AND (u.username IS NULL OR u.username NOT IN (${MODERATION_SYSTEM_USERNAME}, ${BAN_EVASION_SYSTEM_USERNAME}, ${RSS_FEED_AUTO_UPDATER_USERNAME}))
        AND (${communityId}::uuid IS NULL OR ma.community_id = ${communityId}::uuid)
    ),
    actor_totals AS (
      SELECT actor_user_id, COUNT(*)::INT AS total
      FROM actions
      GROUP BY actor_user_id
      ORDER BY total DESC
      LIMIT ${leaderboardPageSize}
    ),
    actor_counts AS (
      SELECT
        a.actor_user_id,
        json_object_agg(a.action_type, a.count ORDER BY a.action_type) AS counts
      FROM (
        SELECT actor_user_id, action_type, COUNT(*)::INT AS count
        FROM actions
        WHERE actor_user_id IN (SELECT actor_user_id FROM actor_totals)
        GROUP BY actor_user_id, action_type
      ) a
      GROUP BY a.actor_user_id
    ),
    weekly AS (
      SELECT
        actor_user_id,
        DATE(date_trunc('week', created_at)) AS week,
        action_type,
        COUNT(*)::INT AS count
      FROM actions
      WHERE actor_user_id IN (SELECT actor_user_id FROM actor_totals)
      GROUP BY actor_user_id, week, action_type
    ),
    weekly_json AS (
      SELECT
        actor_user_id,
        json_agg(json_build_object('date', week::TEXT, 'type', action_type, 'count', count) ORDER BY week ASC, action_type ASC) AS weekly_counts
      FROM weekly
      GROUP BY actor_user_id
    )
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'actor_user_id', at.actor_user_id,
          'total', at.total,
          'counts', COALESCE(ac.counts, '{}'::json),
          'weekly_counts', COALESCE(wj.weekly_counts, '[]'::json)
        )
        ORDER BY at.total DESC, at.actor_user_id ASC
      ),
      '[]'::json
    ) AS moderators
    FROM actor_totals at
    LEFT JOIN actor_counts ac ON ac.actor_user_id = at.actor_user_id
    LEFT JOIN weekly_json wj ON wj.actor_user_id = at.actor_user_id
  `)

  const row = rows[0]!
  return {
    moderators: (row.moderators as ModeratorWorkloadMetrics['moderators']) ?? [],
    users: {},
  }
}
