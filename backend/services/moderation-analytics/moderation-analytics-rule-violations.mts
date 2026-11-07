import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCommunityId } from './moderation-analytics-scope.mts'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import type {
  DailyTypedCountDataPoint,
  ModerationAnalyticsScope,
  RuleViolationMetrics,
} from './types.mts'

export async function getRuleViolations(
  periodStartUuid: string,
  scope: ModerationAnalyticsScope,
): Promise<RuleViolationMetrics> {
  const communityId = getCommunityId(scope)
  const { rows } = await read(sql`/* getModerationRuleViolations */
    WITH reports AS (
      SELECT r.reason::TEXT AS reason, r.created_at
      FROM moderation_reports r
      LEFT JOIN posts p ON p.id = r.post_id
      LEFT JOIN users reporter ON reporter.id = r.reporter_user_id
      WHERE r.id >= ${periodStartUuid}::uuid
        AND (
          ${communityId}::uuid IS NULL
          OR p.community_id = ${communityId}::uuid
          OR (
            r.post_id IS NULL
            AND r.reported_user_id IS NOT NULL
            AND reporter.username = ${BAN_EVASION_SYSTEM_USERNAME}
            AND r.community_id = ${communityId}::uuid
          )
        )
    ),
    reasons AS (
      SELECT reason, COUNT(*)::INT AS count
      FROM reports
      GROUP BY reason
      ORDER BY count DESC, reason ASC
    ),
    reasons_daily AS (
      SELECT DATE(created_at) AS day, reason, COUNT(*)::INT AS count
      FROM reports
      GROUP BY day, reason
      ORDER BY day ASC, reason ASC
    )
    SELECT
      (SELECT COALESCE(json_agg(json_build_object('reason', reason, 'count', count) ORDER BY count DESC, reason ASC), '[]'::json) FROM reasons) AS reasons,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'type', reason, 'count', count) ORDER BY day ASC, reason ASC), '[]'::json) FROM reasons_daily) AS reasons_over_time
  `)

  const row = rows[0]!
  return {
    reasons: (row.reasons as RuleViolationMetrics['reasons']) ?? [],
    reasons_over_time: (row.reasons_over_time as DailyTypedCountDataPoint[]) ?? [],
  }
}
