import sql from 'sql-template-strings'

export function clearanceRejectionAutomodBranch(communityId: string, windowHours: number) {
  return sql`
      SELECT
        'openai_omni:' || p.id::text || ':' || encode(version.content_sha256, 'hex') AS source_key,
        'openai_omni'::moderation_training_source_types AS source_type,
        p.id AS post_id,
        p.community_id AS community_id,
        NULL::uuid AS agent_moderation_id,
        version.content_sha256 AS input_sha256,
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
        TRUE AS is_flagged,
        '[]'::jsonb AS categories,
        disposition.evidence AS model_output,
        'rejected'::text AS current_state,
        latest_feedback.label AS feedback_label
      FROM posts p
      JOIN post_moderation_versions version
        ON version.post_id = p.id
       AND version.content_sha256 = p.llm_moderation_content_sha256
       AND version.policy_revision = '2026-09-09.1'
      JOIN LATERAL (
        SELECT evidence
        FROM (
          SELECT disposition, evidence
          FROM post_moderation_dispositions
          WHERE version_id = version.id AND source = 'openai_omni'
          ORDER BY id DESC LIMIT 1
        ) latest
        WHERE latest.disposition IN ('review', 'reject')
      ) disposition ON true
      LEFT JOIN LATERAL (
        SELECT label
        FROM moderation_training_feedbacks mtf
        WHERE mtf.source_type = 'openai_omni' AND mtf.post_id = p.id
          AND mtf.event_type = 'automod_reviewed'
          AND mtf.input_sha256 IS NOT DISTINCT FROM version.content_sha256
        ORDER BY mtf.id DESC
        LIMIT 1
      ) latest_feedback ON true
      LEFT JOIN posts root_post ON root_post.id = p.root_post_id AND p.post_type = 'comment'
      WHERE p.community_id = ${communityId}
        AND p.deleted_at IS NULL
        AND p.rejected_at IS NOT NULL
        AND p.rejected_at >= NOW() - (${windowHours}::text || ' hours')::interval`
}

export function spamDetectionAutomodBranch(communityId: string, windowHours: number) {
  return sql`
      SELECT
        'spam_detection:' || p.id::text || ':' || encode(version.content_sha256, 'hex') AS source_key,
        'spam_detection'::moderation_training_source_types AS source_type,
        p.id AS post_id,
        p.community_id AS community_id,
        NULL::uuid AS agent_moderation_id,
        version.content_sha256 AS input_sha256,
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
        NULLIF(disposition.evidence->>'composite_score', '')::double precision AS confidence_score,
        TRUE AS is_flagged,
        '[]'::jsonb AS categories,
        disposition.evidence AS model_output,
        'rejected'::text AS current_state,
        latest_feedback.label AS feedback_label
      FROM posts p
      JOIN post_moderation_versions version
        ON version.post_id = p.id
       AND version.content_sha256 = p.llm_moderation_content_sha256
       AND version.policy_revision = '2026-09-09.1'
      JOIN LATERAL (
        SELECT evidence
        FROM (
          SELECT disposition, evidence
          FROM post_moderation_dispositions
          WHERE version_id = version.id AND source = 'spam_detection'
          ORDER BY id DESC LIMIT 1
        ) latest
        WHERE latest.disposition IN ('review', 'reject')
      ) disposition ON true
      LEFT JOIN LATERAL (
        SELECT label
        FROM moderation_training_feedbacks mtf
        WHERE mtf.source_type = 'spam_detection' AND mtf.post_id = p.id
          AND mtf.event_type = 'automod_reviewed'
          AND mtf.input_sha256 IS NOT DISTINCT FROM version.content_sha256
        ORDER BY mtf.id DESC
        LIMIT 1
      ) latest_feedback ON true
      LEFT JOIN posts root_post ON root_post.id = p.root_post_id AND p.post_type = 'comment'
      WHERE p.community_id = ${communityId}
        AND p.deleted_at IS NULL
        AND p.rejected_at IS NOT NULL
        AND p.rejected_at >= NOW() - (${windowHours}::text || ' hours')::interval`
}
