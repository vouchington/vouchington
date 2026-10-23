import sql from 'sql-template-strings'
import type { SearchRecentAutomodActionsOptions } from './types.mts'
import { buildRecentAutomodActionsQuery } from './recent-actions-query.mts'

export function buildRecentAutomodActionsStatsQuery(
  communityId: string,
  options: SearchRecentAutomodActionsOptions,
) {
  const windowHours = options.windowHours ?? 48
  const sourceType = options.sourceType ?? null
  const agentSlug = options.agentSlug ?? null
  const maxConfidence = options.maxConfidence ?? null
  const postType = options.postType ?? null
  const baseQuery = buildRecentAutomodActionsQuery(communityId, options)
  return sql`/* searchRecentAutomodActions:stats */
    WITH filtered_actions AS (
      `.append(baseQuery).append(sql`
    ),
    window_cutoff AS (
      SELECT NOW() - (${windowHours}::text || ' hours')::interval AS cutoff_at
    ),
    historical_false_positives AS (
      SELECT
        mtf.source_type,
        mtf.post_id,
        mtf.agent_moderation_id,
        mtf.input_sha256,
        p.post_type,
        mod.slug AS moderator_slug,
        CASE
          WHEN mtf.source_type IN ('agent_moderation', 'community_prompt')
            AND NULLIF(am.results->>'confidence_score', '') ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
            THEN (am.results->>'confidence_score')::double precision
          WHEN mtf.source_type = 'spam_detection'
            THEN NULLIF(spam_disposition.evidence->>'composite_score', '')::double precision
          ELSE NULL
        END AS confidence_score
      FROM moderation_training_feedbacks mtf
      LEFT JOIN posts p ON p.id = mtf.post_id
      LEFT JOIN post_moderation_versions spam_version
        ON spam_version.post_id = p.id
       AND spam_version.content_sha256 = mtf.input_sha256
       AND spam_version.policy_revision = '2026-09-09.1'
      LEFT JOIN LATERAL (
        SELECT evidence
        FROM post_moderation_dispositions
        WHERE version_id = spam_version.id
          AND source = 'spam_detection'
        ORDER BY id DESC
        LIMIT 1
      ) spam_disposition ON true
      LEFT JOIN agent_moderations am
        ON am.id = mtf.agent_moderation_id AND am.post_id = mtf.post_id
      LEFT JOIN moderator_agents mod ON mod.agent_id = am.agent_id
      CROSS JOIN window_cutoff cutoff
      WHERE mtf.community_id = ${communityId}
        AND mtf.event_type = 'automod_reviewed'
        AND mtf.label = 'false_positive'
        AND mtf.source_type IN ('agent_moderation', 'openai_omni', 'spam_detection', 'community_prompt')
        AND mtf.id >= fn_min_uuidv7(
          date_trunc('milliseconds', cutoff.cutoff_at) +
          CASE WHEN date_trunc('milliseconds', cutoff.cutoff_at) < cutoff.cutoff_at
            THEN INTERVAL '1 millisecond' ELSE INTERVAL '0 milliseconds' END
        )
        AND (${sourceType}::text IS NULL OR mtf.source_type::text = ${sourceType})
        AND (${agentSlug}::text IS NULL OR mod.slug = ${agentSlug})
        AND (${postType}::text IS NULL OR p.post_type::text = ${postType})
    ),
    historical_stats AS (
      SELECT COUNT(*) AS false_positive_count
      FROM historical_false_positives hfp
      WHERE (${maxConfidence}::double precision IS NULL OR hfp.confidence_score IS NULL OR hfp.confidence_score <= ${maxConfidence})
        AND NOT EXISTS (
          SELECT 1
          FROM filtered_actions fa
          WHERE fa.source_type = hfp.source_type
            AND (
              (hfp.source_type IN ('agent_moderation', 'community_prompt')
                AND fa.agent_moderation_id = hfp.agent_moderation_id)
              OR (hfp.source_type IN ('openai_omni', 'spam_detection')
                AND fa.post_id = hfp.post_id
                AND fa.input_sha256 = hfp.input_sha256)
            )
        )
    )
    SELECT
      COUNT(*) + (SELECT false_positive_count FROM historical_stats) AS total_count,
      COUNT(*) FILTER (WHERE feedback_label = 'false_positive') + (SELECT false_positive_count FROM historical_stats) AS false_positive_count
    FROM filtered_actions
  `)
}
