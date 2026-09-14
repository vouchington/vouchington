import sql from 'sql-template-strings'
import type { QueryExecutor } from '@data-stores/psql/types'

export async function getAutomodFeedbackContext(
  communityId: string,
  sourceType: string,
  id: string,
  expectedInputSha256: Buffer | null,
  options: { query: QueryExecutor },
): Promise<{
  post_id: string
  agent_moderation_id: string | null
  input_sha256: Buffer | null
} | null> {
  if (sourceType === 'agent_moderation' || sourceType === 'community_prompt') {
    const { rows } = await options.query(sql`/* getAutomodFeedbackContext:agent */
      SELECT am.post_id, am.id AS agent_moderation_id, am.input_sha256
      FROM agent_moderations am
      JOIN posts p ON p.id = am.post_id
      LEFT JOIN community_agent_prompts cap ON cap.id = am.prompt_id
      LEFT JOIN community_post_reviews cpr ON cpr.post_id = p.id AND cpr.community_id = ${communityId}
      WHERE am.id = ${id}
        AND p.deleted_at IS NULL
        AND am.flagged IS TRUE
        AND am.deleted_at IS NULL
        AND am.input_sha256 IS NOT DISTINCT FROM p.llm_moderation_content_sha256
        AND (
          (
            ${sourceType} = 'community_prompt'
            AND cap.community_id = ${communityId}
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
          )
          OR (
            ${sourceType} = 'agent_moderation'
            AND cap.id IS NULL
            AND p.community_id = ${communityId}
            AND (p.in_review_at IS NOT NULL OR p.rejected_at IS NOT NULL)
          )
        )
      LIMIT 1
    `)
    return (
      (rows[0] as
        | { post_id: string; agent_moderation_id: string; input_sha256: Buffer }
        | undefined) ?? null
    )
  }

  const { rows } = await options.query(sql`/* getAutomodFeedbackContext:post */
    SELECT
      p.id AS post_id,
      NULL::uuid AS agent_moderation_id,
      version.content_sha256 AS input_sha256
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
        WHERE version_id = version.id AND source::text = ${sourceType}
        ORDER BY id DESC LIMIT 1
      ) latest
      WHERE latest.disposition IN ('review', 'reject')
    ) disposition ON true
    WHERE p.id = ${id}
      AND p.community_id = ${communityId}
      AND p.deleted_at IS NULL
      AND p.rejected_at IS NOT NULL
      AND ${sourceType} IN ('openai_omni', 'spam_detection')
      AND version.content_sha256 IS NOT DISTINCT FROM ${expectedInputSha256}
    LIMIT 1
  `)
  return (
    (rows[0] as
      | { post_id: string; agent_moderation_id: null; input_sha256: Buffer | null }
      | undefined) ?? null
  )
}

export async function hasExistingAutomodFeedback(input: {
  sourceType: string
  postId: string
  agentModerationId: string | null
  inputSha256: Buffer | null
  query: QueryExecutor
}): Promise<boolean> {
  const { rows } = await input.query(sql`/* hasExistingAutomodFeedback */
    SELECT 1
    FROM moderation_training_feedbacks mtf
    WHERE mtf.source_type = ${input.sourceType}
      AND mtf.event_type = 'automod_reviewed'
      AND mtf.post_id = ${input.postId}
      AND (
        (${input.agentModerationId}::uuid IS NOT NULL AND mtf.agent_moderation_id = ${input.agentModerationId})
        OR (
          ${input.agentModerationId}::uuid IS NULL
          AND mtf.input_sha256 IS NOT DISTINCT FROM ${input.inputSha256}
        )
      )
    LIMIT 1
  `)
  return rows.length > 0
}

export async function lockAutomodFeedbackSource(
  communityId: string,
  sourceKey: string,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* lockAutomodFeedbackSource */
    SELECT pg_advisory_xact_lock(hashtextextended(${communityId} || ':' || ${sourceKey}, 0))
  `)
}

export async function lockAutomodFeedbackPost(
  communityId: string,
  postId: string,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* lockAutomodFeedbackPost */
    SELECT pg_advisory_xact_lock(hashtextextended(${communityId} || ':' || ${postId}, 0))
  `)
}

export async function lockAutomodFeedbackPostRow(
  postId: string,
  query: QueryExecutor,
): Promise<boolean> {
  const result = await query(sql`/* lockAutomodFeedbackPostRow */
    SELECT 1
    FROM posts
    WHERE id = ${postId}
      AND deleted_at IS NULL
    FOR UPDATE
  `)
  return (result.rowCount ?? 0) > 0
}
