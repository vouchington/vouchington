import sql from 'sql-template-strings'
import type { QueryExecutor } from '@data-stores/psql/types'

export async function hasOtherActiveAutomodSignals(input: {
  communityId: string
  postId: string
  sourceKey: string
  query: QueryExecutor
}): Promise<boolean> {
  const { rows } = await input.query(sql`/* hasOtherActiveAutomodSignals */
    WITH active_signal AS (
      SELECT 'openai_omni:' || p.id::text || ':' || encode(version.content_sha256, 'hex') AS source_key
      FROM posts p
      JOIN post_moderation_versions version
        ON version.post_id = p.id
       AND version.content_sha256 = p.llm_moderation_content_sha256
       AND version.policy_revision = '2026-09-09.1'
      JOIN LATERAL (
        SELECT 1
        FROM (
          SELECT disposition
          FROM post_moderation_dispositions
          WHERE version_id = version.id AND source = 'openai_omni'
          ORDER BY id DESC LIMIT 1
        ) latest
        WHERE latest.disposition IN ('review', 'reject')
      ) disposition ON true
      WHERE p.id = ${input.postId}
        AND p.community_id = ${input.communityId}
        AND p.deleted_at IS NULL
        AND p.rejected_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM moderation_training_feedbacks mtf
          WHERE mtf.source_type = 'openai_omni'
            AND mtf.event_type = 'automod_reviewed'
            AND mtf.label = 'false_positive'
            AND mtf.post_id = p.id
            AND mtf.input_sha256 IS NOT DISTINCT FROM version.content_sha256
        )
      UNION ALL
      SELECT 'spam_detection:' || p.id::text || ':' || encode(version.content_sha256, 'hex') AS source_key
      FROM posts p
      JOIN post_moderation_versions version
        ON version.post_id = p.id
       AND version.content_sha256 = p.llm_moderation_content_sha256
       AND version.policy_revision = '2026-09-09.1'
      JOIN LATERAL (
        SELECT 1
        FROM (
          SELECT disposition
          FROM post_moderation_dispositions
          WHERE version_id = version.id AND source = 'spam_detection'
          ORDER BY id DESC LIMIT 1
        ) latest
        WHERE latest.disposition IN ('review', 'reject')
      ) disposition ON true
      WHERE p.id = ${input.postId}
        AND p.community_id = ${input.communityId}
        AND p.deleted_at IS NULL
        AND p.rejected_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM moderation_training_feedbacks mtf
          WHERE mtf.source_type = 'spam_detection'
            AND mtf.event_type = 'automod_reviewed'
            AND mtf.label = 'false_positive'
            AND mtf.post_id = p.id
            AND mtf.input_sha256 IS NOT DISTINCT FROM version.content_sha256
        )
      UNION ALL
      SELECT 'agent_moderation:' || am.id::text AS source_key
      FROM agent_moderations am
      JOIN posts p ON p.id = am.post_id
      LEFT JOIN community_agent_prompts cap ON cap.id = am.prompt_id
      WHERE p.id = ${input.postId}
        AND p.community_id = ${input.communityId}
        AND p.deleted_at IS NULL
        AND am.flagged IS TRUE
        AND am.deleted_at IS NULL
        AND am.input_sha256 IS NOT DISTINCT FROM p.llm_moderation_content_sha256
        AND cap.id IS NULL
        AND (p.in_review_at IS NOT NULL OR p.rejected_at IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM moderation_training_feedbacks mtf
          WHERE mtf.source_type = 'agent_moderation'
            AND mtf.event_type = 'automod_reviewed'
            AND mtf.label = 'false_positive'
            AND mtf.agent_moderation_id = am.id
        )
      UNION ALL
      SELECT 'community_prompt:' || am.id::text AS source_key
      FROM agent_moderations am
      JOIN posts p ON p.id = am.post_id
      JOIN community_agent_prompts cap ON cap.id = am.prompt_id
      JOIN community_post_reviews cpr ON cpr.post_id = p.id AND cpr.community_id = cap.community_id
      WHERE p.id = ${input.postId}
        AND cap.community_id = ${input.communityId}
        AND p.deleted_at IS NULL
        AND am.flagged IS TRUE
        AND am.deleted_at IS NULL
        AND am.input_sha256 IS NOT DISTINCT FROM p.llm_moderation_content_sha256
        AND cap.on_flag_action = 'unpublish'
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
        AND NOT EXISTS (
          SELECT 1
          FROM moderation_training_feedbacks mtf
          WHERE mtf.source_type = 'community_prompt'
            AND mtf.event_type = 'automod_reviewed'
            AND mtf.label = 'false_positive'
            AND mtf.agent_moderation_id = am.id
        )
    )
    SELECT 1
    FROM active_signal
    WHERE source_key IS DISTINCT FROM ${input.sourceKey}
    LIMIT 1
  `)
  return rows.length > 0
}
