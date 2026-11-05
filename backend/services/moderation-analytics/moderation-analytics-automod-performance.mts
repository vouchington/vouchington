import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCommunityId } from './moderation-analytics-scope.mts'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import type {
  AutomodPerformanceMetrics,
  DailyTypedCountDataPoint,
  ModerationAnalyticsScope,
} from './types.mts'

export async function getAutomodPerformance(
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
      -- no-mistakes-disable-next-line postgres-required-predicates: time-window moderation reporting spans target post_id partitions
      FROM agent_moderations am
      LEFT JOIN community_agent_prompts cap ON cap.id = am.prompt_id
      LEFT JOIN posts p ON p.id = am.post_id
      WHERE am.id >= ${periodStartUuid}::uuid
        AND am.is_flagged = TRUE
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
        SELECT category::text AS source_type,
          CASE WHEN category = 'spam_detection' THEN (
            SELECT NULLIF(disposition.evidence->>'composite_score', '')::numeric
            FROM post_moderation_versions version
            JOIN post_moderation_dispositions disposition ON disposition.version_id = version.id
            WHERE version.post_id = p.id
              AND version.content_sha256 = p.llm_moderation_content_sha256
              AND disposition.source = 'spam_detection'
            ORDER BY disposition.id DESC
            LIMIT 1
          ) END AS confidence
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
      JOIN users u ON u.id = ma.actor_user_id
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
