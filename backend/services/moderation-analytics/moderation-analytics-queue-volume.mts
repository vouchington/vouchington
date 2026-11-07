import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCommunityId } from './moderation-analytics-scope.mts'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import { MODERATION_ANALYTICS_ACTION_TYPES } from './moderation-action-types.mts'
import type {
  DailyCountDataPoint,
  DailyTypedCountDataPoint,
  ModerationAnalyticsScope,
  QueueVolumeMetrics,
} from './types.mts'

export async function getQueueVolume(
  periodStartUuid: string,
  scope: ModerationAnalyticsScope,
): Promise<QueueVolumeMetrics> {
  const communityId = getCommunityId(scope)
  const { rows } = await read(sql`/* getModerationQueueVolume */
    WITH scoped_reports AS (
      SELECT
        r.id,
        CASE
          WHEN r.reviewed_at IS NULL THEN 'pending'
          ELSE r.resolution_action::text
        END AS status,
        r.created_at
      FROM moderation_reports r
      LEFT JOIN posts p ON p.id = r.post_id
      LEFT JOIN users reporter ON reporter.id = r.reporter_user_id
      WHERE ${communityId}::uuid IS NULL
        OR p.community_id = ${communityId}::uuid
        OR (
          r.post_id IS NULL
          AND r.reported_user_id IS NOT NULL
          AND reporter.username = ${BAN_EVASION_SYSTEM_USERNAME}
          AND r.community_id = ${communityId}::uuid
        )
    ),
    reports AS (
      SELECT status, created_at
      FROM scoped_reports
      WHERE id >= ${periodStartUuid}::uuid
    ),
    report_daily AS (
      SELECT DATE(created_at) AS day, COUNT(*)::INT AS count
      FROM reports
      GROUP BY day
    ),
    clearance_daily AS (
      SELECT
        DATE(pcc.created_at) AS day,
        pcc.change_type::TEXT AS type,
        COUNT(*)::INT AS count
      FROM post_clearance_changes pcc
      LEFT JOIN posts p ON p.id = pcc.post_id
      WHERE pcc.id >= ${periodStartUuid}::uuid
        AND (${communityId}::uuid IS NULL OR p.community_id = ${communityId}::uuid)
      GROUP BY day, type
    ),
    moderator_action_daily AS (
      SELECT
        DATE(uuid_extract_timestamp(ma.id)) AS day,
        ma.action_type::TEXT AS type,
        COUNT(*)::INT AS count
      FROM moderator_actions ma
      WHERE ma.id >= ${periodStartUuid}::uuid
        AND ma.action_type = ANY(${MODERATION_ANALYTICS_ACTION_TYPES}::moderator_action_types[])
        AND (${communityId}::uuid IS NULL OR ma.community_id = ${communityId}::uuid)
      GROUP BY day, type
    )
    SELECT
      (SELECT COUNT(*)::INT FROM reports) AS total_reports,
      (SELECT COUNT(*)::INT FROM scoped_reports WHERE status = 'pending') AS pending_reports,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'count', count) ORDER BY day), '[]'::json) FROM report_daily) AS reports_over_time,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'type', type, 'count', count) ORDER BY day, type), '[]'::json) FROM clearance_daily) AS clearance_actions_over_time,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'type', type, 'count', count) ORDER BY day, type), '[]'::json) FROM moderator_action_daily) AS moderator_actions_over_time
  `)

  const row = rows[0]!
  return {
    total_reports: (row.total_reports as number) ?? 0,
    pending_reports: (row.pending_reports as number) ?? 0,
    reports_over_time: (row.reports_over_time as DailyCountDataPoint[]) ?? [],
    clearance_actions_over_time:
      (row.clearance_actions_over_time as DailyTypedCountDataPoint[]) ?? [],
    moderator_actions_over_time:
      (row.moderator_actions_over_time as DailyTypedCountDataPoint[]) ?? [],
  }
}
