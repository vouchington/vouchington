/* oxlint-disable max-lines -- Moderation analytics keeps related SQL aggregates together for one dashboard contract. */
import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import {
  BAN_EVASION_SYSTEM_USERNAME,
  MODERATION_SYSTEM_USERNAME,
  RSS_FEED_AUTO_UPDATER_USERNAME,
} from '@services/users/constants'
import sql from 'sql-template-strings'
import type {
  AppealMetrics,
  AutomodPerformanceMetrics,
  DailyCountDataPoint,
  DailyTypedCountDataPoint,
  ModerationAnalytics,
  ModerationAnalyticsRange,
  ModerationAnalyticsScope,
  ModeratorWorkloadMetrics,
  NewUserFrictionMetrics,
  QueueVolumeMetrics,
  RuleViolationMetrics,
} from './types.mts'

export async function getModerationAnalytics(
  range: ModerationAnalyticsRange,
  scope: ModerationAnalyticsScope,
): Promise<ModerationAnalytics> {
  const now = new Date()
  const periodStart = getRangeStart(range, now)
  const periodStartUuid = getMinUUIDv7ForDate(periodStart)

  const [
    queueVolume,
    ruleViolations,
    automodPerformance,
    moderatorWorkload,
    appeals,
    newUserFriction,
  ] = await Promise.all([
    getQueueVolume(periodStartUuid, scope),
    getRuleViolations(periodStartUuid, scope),
    getAutomodPerformance(periodStartUuid, scope),
    getModeratorWorkload(periodStartUuid, scope),
    getAppeals(periodStart, scope),
    getNewUserFriction(periodStartUuid, scope),
  ])

  return {
    range,
    period_start: periodStart.toISOString(),
    period_end: now.toISOString(),
    scope:
      scope.type === 'community'
        ? { type: 'community', community_id: scope.communityId }
        : { type: 'global' },
    queue_volume: queueVolume,
    rule_violations: ruleViolations,
    automod_performance: automodPerformance,
    moderator_workload: moderatorWorkload,
    appeals,
    new_user_friction: newUserFriction,
  }
}

export function getRangeStart(range: ModerationAnalyticsRange, now: Date): Date {
  const d = new Date(now)
  switch (range) {
    case 'today': {
      d.setUTCHours(0, 0, 0, 0)
      return d
    }
    case '7d': {
      d.setUTCDate(d.getUTCDate() - 7)
      return d
    }
    case '30d': {
      d.setUTCDate(d.getUTCDate() - 30)
      return d
    }
    case '90d': {
      d.setUTCDate(d.getUTCDate() - 90)
      return d
    }
    case 'all': {
      return new Date(0)
    }
  }
}

async function getQueueVolume(
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
          AND EXISTS (
            SELECT 1
            FROM community_members cm
            WHERE cm.user_id = r.reported_user_id
              AND cm.community_id = ${communityId}::uuid
              AND cm.suspected_ban_evader_at IS NOT NULL
          )
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

async function getRuleViolations(
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
            AND EXISTS (
              SELECT 1
              FROM community_members cm
              WHERE cm.user_id = r.reported_user_id
                AND cm.community_id = ${communityId}::uuid
                AND cm.suspected_ban_evader_at IS NOT NULL
            )
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

async function getAutomodPerformance(
  periodStartUuid: string,
  scope: ModerationAnalyticsScope,
): Promise<AutomodPerformanceMetrics> {
  const communityId = getCommunityId(scope)
  const { rows } = await read(sql`/* getModerationAutomodPerformance */
    WITH automod_events AS (
      SELECT
        uuid_extract_timestamp(am.id) AS created_at,
        CASE WHEN cap.id IS NOT NULL THEN 'community_prompt' ELSE 'agent_moderation' END AS source_type,
        CASE
          WHEN am.results ? 'confidence_score'
            AND (am.results->>'confidence_score') ~ '^[0-9]+(\\.[0-9]+)?$'
          THEN (am.results->>'confidence_score')::numeric
          ELSE NULL
        END AS confidence,
        COALESCE(cap.community_id, p.community_id) AS scope_community_id
      FROM agent_moderations am
      LEFT JOIN community_agent_prompts cap ON cap.id = am.prompt_id
      LEFT JOIN posts p ON p.id = am.post_id
      WHERE am.id >= ${periodStartUuid}::uuid
        AND am.flagged = TRUE
        AND am.deleted_at IS NULL
      UNION ALL
      SELECT
        pcc.created_at AS created_at,
        source.source_type,
        source.confidence,
        p.community_id AS scope_community_id
      FROM post_clearance_changes pcc
      JOIN posts p ON p.id = pcc.post_id
      JOIN LATERAL (
        SELECT category AS source_type,
          CASE WHEN category = 'spam_detection' THEN p.spam_detection_score::numeric END AS confidence
        FROM unnest(pcc.moderation_transparency_categories) AS category
      ) source ON TRUE
      WHERE pcc.id >= ${periodStartUuid}::uuid
        AND pcc.change_type = 'reject'
    ),
    scoped_events AS (
      SELECT *
      FROM automod_events
      WHERE created_at IS NOT NULL
        AND (${communityId}::uuid IS NULL OR scope_community_id = ${communityId}::uuid)
    ),
    actions_daily AS (
      SELECT DATE(created_at) AS day, source_type, COUNT(*)::INT AS count
      FROM scoped_events
      GROUP BY day, source_type
    ),
    sources AS (
      SELECT source_type, COUNT(*)::INT AS count
      FROM scoped_events
      GROUP BY source_type
      ORDER BY count DESC, source_type ASC
    ),
    confidence AS (
      SELECT
        CASE
          WHEN confidence IS NULL THEN 'unknown'
          WHEN confidence < 0.5 THEN '< 0.50'
          WHEN confidence < 0.75 THEN '0.50-0.74'
          WHEN confidence < 0.9 THEN '0.75-0.89'
          ELSE '0.90+'
        END AS bucket,
        COUNT(*)::INT AS count
      FROM scoped_events
      GROUP BY bucket
    ),
    training AS (
      SELECT
        COUNT(*) FILTER (WHERE mtf.event_type = 'automod_reviewed')::INT AS reviewed_count,
        COUNT(*) FILTER (
          WHERE mtf.event_type = 'automod_reviewed'
            AND mtf.label = 'false_positive'
        )::INT AS false_positive_count
      FROM moderation_training_feedbacks mtf
      WHERE mtf.id >= ${periodStartUuid}::uuid
        AND mtf.source_type IN ('agent_moderation', 'community_prompt', 'openai_omni', 'spam_detection')
        AND (${communityId}::uuid IS NULL OR mtf.community_id = ${communityId}::uuid)
    ),
    auto_removes AS (
      SELECT COUNT(*)::INT AS count
      FROM moderator_actions ma
      JOIN users u ON u.id = ma.actor_id
      WHERE ma.id >= ${periodStartUuid}::uuid
        AND ma.action_type IN ('remove', 'reject')
        AND u.username = ${MODERATION_SYSTEM_USERNAME}
        AND (${communityId}::uuid IS NULL OR ma.community_id = ${communityId}::uuid)
    )
    SELECT
      (SELECT COUNT(*)::INT FROM scoped_events) AS total_actions,
      (SELECT count FROM auto_removes) AS auto_removes,
      (SELECT reviewed_count FROM training) AS reviewed_count,
      (SELECT false_positive_count FROM training) AS false_positive_count,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'type', source_type, 'count', count) ORDER BY day ASC, source_type ASC), '[]'::json) FROM actions_daily) AS actions_over_time,
      (SELECT COALESCE(json_agg(json_build_object('bucket', bucket, 'count', count) ORDER BY bucket ASC), '[]'::json) FROM confidence) AS confidence_distribution,
      (SELECT COALESCE(json_agg(json_build_object('source_type', source_type, 'count', count) ORDER BY count DESC, source_type ASC), '[]'::json) FROM sources) AS sources
  `)

  const row = rows[0]!
  const reviewedCount = (row.reviewed_count as number) ?? 0
  const falsePositiveCount = (row.false_positive_count as number) ?? 0

  return {
    total_actions: (row.total_actions as number) ?? 0,
    auto_removes: (row.auto_removes as number) ?? 0,
    reviewed_count: reviewedCount,
    false_positive_count: falsePositiveCount,
    false_positive_rate: reviewedCount > 0 ? falsePositiveCount / reviewedCount : null,
    actions_over_time: (row.actions_over_time as DailyTypedCountDataPoint[]) ?? [],
    confidence_distribution:
      (row.confidence_distribution as AutomodPerformanceMetrics['confidence_distribution']) ?? [],
    sources: (row.sources as AutomodPerformanceMetrics['sources']) ?? [],
  }
}

async function getModeratorWorkload(
  periodStartUuid: string,
  scope: ModerationAnalyticsScope,
): Promise<ModeratorWorkloadMetrics> {
  const communityId = getCommunityId(scope)
  const { rows } = await read(sql`/* getModerationModeratorWorkload */
    WITH actions AS (
      SELECT
        ma.actor_id,
        ma.action_type::TEXT AS action_type,
        uuid_extract_timestamp(ma.id) AS created_at
      FROM moderator_actions ma
      JOIN users u ON u.id = ma.actor_id
      WHERE ma.id >= ${periodStartUuid}::uuid
        AND ma.actor_id IS NOT NULL
        AND (u.username IS NULL OR u.username NOT IN (${MODERATION_SYSTEM_USERNAME}, ${BAN_EVASION_SYSTEM_USERNAME}, ${RSS_FEED_AUTO_UPDATER_USERNAME}))
        AND (${communityId}::uuid IS NULL OR ma.community_id = ${communityId}::uuid)
    ),
    actor_totals AS (
      SELECT actor_id, COUNT(*)::INT AS total
      FROM actions
      GROUP BY actor_id
      ORDER BY total DESC
      LIMIT 10
    ),
    actor_counts AS (
      SELECT
        a.actor_id,
        json_object_agg(a.action_type, a.count ORDER BY a.action_type) AS counts
      FROM (
        SELECT actor_id, action_type, COUNT(*)::INT AS count
        FROM actions
        WHERE actor_id IN (SELECT actor_id FROM actor_totals)
        GROUP BY actor_id, action_type
      ) a
      GROUP BY a.actor_id
    ),
    weekly AS (
      SELECT
        actor_id,
        DATE(date_trunc('week', created_at)) AS week,
        action_type,
        COUNT(*)::INT AS count
      FROM actions
      WHERE actor_id IN (SELECT actor_id FROM actor_totals)
      GROUP BY actor_id, week, action_type
    ),
    weekly_json AS (
      SELECT
        actor_id,
        json_agg(json_build_object('date', week::TEXT, 'type', action_type, 'count', count) ORDER BY week ASC, action_type ASC) AS weekly_counts
      FROM weekly
      GROUP BY actor_id
    )
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'actor_id', at.actor_id,
          'total', at.total,
          'counts', COALESCE(ac.counts, '{}'::json),
          'weekly_counts', COALESCE(wj.weekly_counts, '[]'::json)
        )
        ORDER BY at.total DESC, at.actor_id ASC
      ),
      '[]'::json
    ) AS moderators
    FROM actor_totals at
    LEFT JOIN actor_counts ac ON ac.actor_id = at.actor_id
    LEFT JOIN weekly_json wj ON wj.actor_id = at.actor_id
  `)

  const row = rows[0]!
  return {
    moderators: (row.moderators as ModeratorWorkloadMetrics['moderators']) ?? [],
    users: {},
  }
}

async function getAppeals(
  periodStart: Date,
  scope: ModerationAnalyticsScope,
): Promise<AppealMetrics> {
  const communityId = getCommunityId(scope)
  const { rows } = await read(sql`/* getModerationAppeals */
    SELECT
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::INT AS total_closed,
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolution_action = 'accept')::INT AS accepted,
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolution_action = 'reduce')::INT AS reduced,
      COUNT(*) FILTER (WHERE resolution_action = 'deny')::INT AS denied,
      0::INT AS dismissed
    FROM moderation_appeals
    WHERE resolved_at >= ${periodStart}
      AND (${communityId}::uuid IS NULL OR community_id = ${communityId}::uuid)
  `)

  const row = rows[0]!
  const totalClosed = (row.total_closed as number) ?? 0
  const accepted = (row.accepted as number) ?? 0
  const reduced = (row.reduced as number) ?? 0

  return {
    total_closed: totalClosed,
    accepted,
    reduced,
    denied: (row.denied as number) ?? 0,
    dismissed: (row.dismissed as number) ?? 0,
    success_rate: totalClosed > 0 ? (accepted + reduced) / totalClosed : null,
  }
}

async function getNewUserFriction(
  periodStartUuid: string,
  scope: ModerationAnalyticsScope,
): Promise<NewUserFrictionMetrics> {
  const communityId = getCommunityId(scope)
  const { rows } = await read(sql`/* getModerationNewUserFriction */
    WITH first_posts AS (
      SELECT
        p.id,
        p.rejected_at,
        p.deleted_at,
        p.deleted_by_id,
        p.created_by_id,
        cpr.rejected_at AS community_rejected_at,
        cpr.unpublished_at AS community_unpublished_at
      FROM posts p
      LEFT JOIN community_post_reviews cpr ON cpr.post_id = p.id
      WHERE p.id >= ${periodStartUuid}::uuid
        AND p.created_by_id != '00000000-0000-7000-8000-000000000000'::uuid
        AND (${communityId}::uuid IS NULL OR p.community_id = ${communityId}::uuid)
        AND NOT EXISTS (
          SELECT 1
          FROM posts prior
          WHERE prior.created_by_id = p.created_by_id
            AND prior.id < p.id
            AND (${communityId}::uuid IS NULL OR prior.community_id = ${communityId}::uuid)
        )
    )
    SELECT
      COUNT(*)::INT AS first_posts,
      COUNT(*) FILTER (
        WHERE rejected_at IS NOT NULL
          OR community_rejected_at IS NOT NULL
          OR community_unpublished_at IS NOT NULL
          OR (deleted_at IS NOT NULL AND deleted_by_id != created_by_id)
      )::INT AS rejected_first_posts
    FROM first_posts
  `)

  const row = rows[0]!
  const firstPosts = (row.first_posts as number) ?? 0
  const rejectedFirstPosts = (row.rejected_first_posts as number) ?? 0

  return {
    first_posts: firstPosts,
    rejected_first_posts: rejectedFirstPosts,
    rejection_rate: firstPosts > 0 ? rejectedFirstPosts / firstPosts : null,
  }
}

function getCommunityId(scope: ModerationAnalyticsScope): string | null {
  return scope.type === 'community' ? scope.communityId : null
}
