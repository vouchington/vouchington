/* oxlint-disable max-lines -- recent automod action union SQL stays together so source branches remain comparable. */
import sql from 'sql-template-strings'
import type { SearchRecentAutomodActionsOptions } from './types.mts'
export function buildRecentAutomodActionsQuery(
  communityId: string,
  options: SearchRecentAutomodActionsOptions,
) {
  const windowHours = options.windowHours ?? 48
  const sourceType = options.sourceType ?? null
  const agentSlug = options.agentSlug ?? null
  const maxConfidence = options.maxConfidence ?? null
  return sql`/* searchRecentAutomodActions */
    WITH recent AS (
      SELECT
        'community_prompt:' || am.id::text AS source_key,
        'community_prompt'::text AS source_type,
        p.id AS post_id,
        cap.community_id AS community_id,
        am.id AS agent_moderation_id,
        NULL::text AS moderator_slug,
        COALESCE(NULLIF(BTRIM(p.title), ''), 'Untitled post') AS title,
        NULLIF(BTRIM(p.title), '') AS authored_title,
        p.declared_language,
        p.lingua_rs_detected_language,
        LEFT(p.markdown, 500) AS markdown_preview,
        p.post_type,
        CASE WHEN p.post_type = 'comment' AND root_post.id IS NOT NULL THEN '/' || CASE root_post.post_type WHEN 'data_point' THEN 'data-point' WHEN 'blog_post' THEN 'blog-post' WHEN 'topic_recommendation' THEN 'topic-recommendations' ELSE root_post.post_type::text END || '/' || root_post.id::text || '/comment/' || p.id::text WHEN p.post_type = 'topic_recommendation' THEN '/topic-recommendations/' || p.id::text || '/edit' ELSE '/' || CASE p.post_type WHEN 'data_point' THEN 'data-point' WHEN 'blog_post' THEN 'blog-post' ELSE p.post_type::text END || '/' || p.id::text END AS post_href,
        p.created_at,
        cpr.unpublished_at AS action_at,
        CASE
          WHEN NULLIF(am.results->>'confidence_score', '') ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
            THEN (am.results->>'confidence_score')::double precision
          ELSE NULL
        END AS confidence_score,
        am.flagged,
        NULLIF(am.results->>'reason', '') AS reason,
        CASE
          WHEN jsonb_typeof(am.results->'categories') = 'array' THEN am.results->'categories'
          ELSE '[]'::jsonb
        END AS categories,
        am.results AS model_output,
        'unpublished'::text AS current_state,
        latest_feedback.label AS feedback_label
      FROM agent_moderations am
      JOIN community_agent_prompts cap ON cap.id = am.prompt_id
      JOIN posts p ON p.id = am.post_id
      LEFT JOIN posts root_post ON root_post.id = p.root_id AND p.post_type = 'comment'
      JOIN community_post_reviews cpr ON cpr.post_id = p.id AND cpr.community_id = cap.community_id
      LEFT JOIN LATERAL (
        SELECT label
        FROM moderation_training_feedbacks mtf
        WHERE mtf.agent_moderation_id = am.id
          AND mtf.source_type = 'community_prompt'
          AND mtf.event_type = 'automod_reviewed'
        ORDER BY mtf.id DESC
        LIMIT 1
      ) latest_feedback ON true
      WHERE cap.community_id = ${communityId}
        AND am.flagged IS TRUE
        AND cap.on_flag_action = 'unpublish'
        AND am.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND am.input_sha256 IS NOT DISTINCT FROM p.llm_moderation_content_sha256
        AND cpr.unpublished_at IS NOT NULL
        AND cpr.unpublished_by_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM agent_moderations newer_am
          JOIN community_agent_prompts newer_cap ON newer_cap.id = newer_am.prompt_id
          WHERE newer_am.post_id = am.post_id
            AND newer_cap.community_id = cap.community_id
            AND newer_cap.on_flag_action = 'unpublish'
            AND newer_am.flagged IS TRUE
            AND newer_am.deleted_at IS NULL
            AND newer_am.input_sha256 IS NOT DISTINCT FROM p.llm_moderation_content_sha256
            AND (newer_am.created_at, newer_am.id) > (am.created_at, am.id)
        )
        AND cpr.unpublished_at >= NOW() - (${windowHours}::text || ' hours')::interval
      UNION ALL
      SELECT
        'agent_moderation:' || am.id::text AS source_key,
        'agent_moderation'::text AS source_type,
        p.id AS post_id,
        p.community_id AS community_id,
        am.id AS agent_moderation_id,
        mod.slug AS moderator_slug,
        COALESCE(NULLIF(BTRIM(p.title), ''), 'Untitled post') AS title,
        NULLIF(BTRIM(p.title), '') AS authored_title,
        p.declared_language,
        p.lingua_rs_detected_language,
        LEFT(p.markdown, 500) AS markdown_preview,
        p.post_type,
        CASE WHEN p.post_type = 'comment' AND root_post.id IS NOT NULL THEN '/' || CASE root_post.post_type WHEN 'data_point' THEN 'data-point' WHEN 'blog_post' THEN 'blog-post' WHEN 'topic_recommendation' THEN 'topic-recommendations' ELSE root_post.post_type::text END || '/' || root_post.id::text || '/comment/' || p.id::text WHEN p.post_type = 'topic_recommendation' THEN '/topic-recommendations/' || p.id::text || '/edit' ELSE '/' || CASE p.post_type WHEN 'data_point' THEN 'data-point' WHEN 'blog_post' THEN 'blog-post' ELSE p.post_type::text END || '/' || p.id::text END AS post_href,
        p.created_at,
        COALESCE(p.in_review_at, p.rejected_at, am.created_at) AS action_at,
        CASE
          WHEN NULLIF(am.results->>'confidence_score', '') ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
            THEN (am.results->>'confidence_score')::double precision
          ELSE NULL
        END AS confidence_score,
        am.flagged,
        NULLIF(am.results->>'reason', '') AS reason,
        CASE
          WHEN jsonb_typeof(am.results->'categories') = 'array' THEN am.results->'categories'
          ELSE '[]'::jsonb
        END AS categories,
        am.results AS model_output,
        CASE WHEN p.rejected_at IS NOT NULL THEN 'rejected' ELSE 'in_review' END::text AS current_state,
        latest_feedback.label AS feedback_label
      FROM agent_moderations am
      JOIN agents__moderators mod ON mod.agent_id = am.agent_id
      JOIN posts p ON p.id = am.post_id
      LEFT JOIN posts root_post ON root_post.id = p.root_id AND p.post_type = 'comment'
      LEFT JOIN community_agent_prompts cap ON cap.id = am.prompt_id
      LEFT JOIN LATERAL (
        SELECT label
        FROM moderation_training_feedbacks mtf
        WHERE mtf.agent_moderation_id = am.id
          AND mtf.source_type = 'agent_moderation'
          AND mtf.event_type = 'automod_reviewed'
        ORDER BY mtf.id DESC
        LIMIT 1
      ) latest_feedback ON true
      WHERE p.community_id = ${communityId}
        AND cap.id IS NULL
        AND am.flagged IS TRUE
        AND am.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND am.input_sha256 IS NOT DISTINCT FROM p.llm_moderation_content_sha256
        AND (p.in_review_at IS NOT NULL OR p.rejected_at IS NOT NULL)
        AND (
          p.in_review_at >= NOW() - (${windowHours}::text || ' hours')::interval
          OR (
            p.in_review_at IS NULL
            AND p.rejected_at >= NOW() - (${windowHours}::text || ' hours')::interval
          )
          OR (
            p.in_review_at IS NULL
            AND p.rejected_at IS NULL
            AND am.created_at >= NOW() - (${windowHours}::text || ' hours')::interval
          )
        )
      UNION ALL
      SELECT
        'openai_omni:' || p.id::text || ':' || encode(p.openai_omni_moderation_input_sha256, 'hex') AS source_key,
        'openai_omni'::text AS source_type,
        p.id AS post_id,
        p.community_id AS community_id,
        NULL::uuid AS agent_moderation_id,
        NULL::text AS moderator_slug,
        COALESCE(NULLIF(BTRIM(p.title), ''), 'Untitled post') AS title,
        NULLIF(BTRIM(p.title), '') AS authored_title,
        p.declared_language,
        p.lingua_rs_detected_language,
        LEFT(p.markdown, 500) AS markdown_preview,
        p.post_type,
        CASE WHEN p.post_type = 'comment' AND root_post.id IS NOT NULL THEN '/' || CASE root_post.post_type WHEN 'data_point' THEN 'data-point' WHEN 'blog_post' THEN 'blog-post' WHEN 'topic_recommendation' THEN 'topic-recommendations' ELSE root_post.post_type::text END || '/' || root_post.id::text || '/comment/' || p.id::text WHEN p.post_type = 'topic_recommendation' THEN '/topic-recommendations/' || p.id::text || '/edit' ELSE '/' || CASE p.post_type WHEN 'data_point' THEN 'data-point' WHEN 'blog_post' THEN 'blog-post' ELSE p.post_type::text END || '/' || p.id::text END AS post_href,
        p.created_at,
        p.rejected_at AS action_at,
        NULL::double precision AS confidence_score,
        p.openai_omni_moderation_flagged AS flagged,
        NULL::text AS reason,
        '[]'::jsonb AS categories,
        p.openai_omni_moderation_results AS model_output,
        'rejected'::text AS current_state,
        latest_feedback.label AS feedback_label
      FROM posts p
      LEFT JOIN LATERAL (
        SELECT label
        FROM moderation_training_feedbacks mtf
        WHERE mtf.source_type = 'openai_omni' AND mtf.post_id = p.id
          AND mtf.event_type = 'automod_reviewed'
          AND mtf.input_sha256 IS NOT DISTINCT FROM p.openai_omni_moderation_input_sha256
        ORDER BY mtf.id DESC
        LIMIT 1
      ) latest_feedback ON true
      LEFT JOIN posts root_post ON root_post.id = p.root_id AND p.post_type = 'comment'
      WHERE p.community_id = ${communityId}
        AND p.openai_omni_moderation_flagged IS TRUE
        AND p.openai_omni_moderation_input_sha256 IS NOT NULL
        AND p.deleted_at IS NULL
        AND p.rejected_at IS NOT NULL
        AND p.rejected_at >= NOW() - (${windowHours}::text || ' hours')::interval
      UNION ALL
      SELECT
        'spam_detection:' || p.id::text || ':' || encode(p.llm_moderation_content_sha256, 'hex') AS source_key,
        'spam_detection'::text AS source_type,
        p.id AS post_id,
        p.community_id AS community_id,
        NULL::uuid AS agent_moderation_id,
        NULL::text AS moderator_slug,
        COALESCE(NULLIF(BTRIM(p.title), ''), 'Untitled post') AS title,
        NULLIF(BTRIM(p.title), '') AS authored_title,
        p.declared_language,
        p.lingua_rs_detected_language,
        LEFT(p.markdown, 500) AS markdown_preview,
        p.post_type,
        CASE WHEN p.post_type = 'comment' AND root_post.id IS NOT NULL THEN '/' || CASE root_post.post_type WHEN 'data_point' THEN 'data-point' WHEN 'blog_post' THEN 'blog-post' WHEN 'topic_recommendation' THEN 'topic-recommendations' ELSE root_post.post_type::text END || '/' || root_post.id::text || '/comment/' || p.id::text WHEN p.post_type = 'topic_recommendation' THEN '/topic-recommendations/' || p.id::text || '/edit' ELSE '/' || CASE p.post_type WHEN 'data_point' THEN 'data-point' WHEN 'blog_post' THEN 'blog-post' ELSE p.post_type::text END || '/' || p.id::text END AS post_href,
        p.created_at,
        p.rejected_at AS action_at,
        p.spam_detection_score AS confidence_score,
        p.spam_detection_flagged AS flagged,
        NULL::text AS reason,
        '[]'::jsonb AS categories,
        p.spam_detection_results AS model_output,
        'rejected'::text AS current_state,
        latest_feedback.label AS feedback_label
      FROM posts p
      LEFT JOIN LATERAL (
        SELECT label
        FROM moderation_training_feedbacks mtf
        WHERE mtf.source_type = 'spam_detection' AND mtf.post_id = p.id
          AND mtf.event_type = 'automod_reviewed'
          AND mtf.input_sha256 IS NOT DISTINCT FROM p.llm_moderation_content_sha256
        ORDER BY mtf.id DESC
        LIMIT 1
      ) latest_feedback ON true
      LEFT JOIN posts root_post ON root_post.id = p.root_id AND p.post_type = 'comment'
      WHERE p.community_id = ${communityId}
        AND p.spam_detection_flagged IS TRUE
        AND p.deleted_at IS NULL
        AND p.rejected_at IS NOT NULL
        AND p.rejected_at >= NOW() - (${windowHours}::text || ' hours')::interval
    ),
    filtered AS (
      SELECT *
      FROM recent
      WHERE (${sourceType}::text IS NULL OR source_type = ${sourceType})
        AND (${agentSlug}::text IS NULL OR moderator_slug = ${agentSlug})
        AND (${options.postType ?? null}::text IS NULL OR post_type::text = ${options.postType ?? null})
        AND (${maxConfidence}::double precision IS NULL OR confidence_score IS NULL OR confidence_score <= ${maxConfidence})
    )
    SELECT *
    FROM filtered
  `
}
