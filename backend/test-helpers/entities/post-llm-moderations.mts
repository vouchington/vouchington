/**
 * Agent moderations entity helpers
 */

/** Shared fixture for AI-generated moderation results used across tests. */
export const mockAiGeneratedModerationResults = {
  flagged: true,
  reason: 'Detected as AI-generated (99.1% confidence; threshold 95.0%).',
  confidence_score: 0.991,
  confidence_threshold: 0.95,
  classification: 'ai' as const,
  detector: 'is-it-slop',
  detector_model_version: 'test-model',
}

import crypto from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Insert a test agent moderation record for a post
 */
export async function insertTestAgentModeration(options: {
  postId: string
  promptId: string
  agentId: string
  results?: Record<string, unknown> & { flagged: boolean; reason: string }
  flagged?: boolean
  inputSha256?: Buffer
  occurredAt?: Date
  occurredAtSequence?: number
  deletedAt?: Date | null
}): Promise<string> {
  const results = options.results ?? { flagged: false, reason: 'Test moderation' }
  const flagged = options.flagged ?? false
  const deletedAt = options.deletedAt === undefined ? null : options.deletedAt
  const inputSha256 =
    options.inputSha256 ??
    (flagged ? await getPostLLMModerationInputSha256(options.postId) : crypto.randomBytes(32))

  const id = options.occurredAt
    ? uuidv7({ msecs: options.occurredAt.getTime(), seq: options.occurredAtSequence ?? 0 })
    : null
  const { rows } = await write(sql`
    INSERT INTO agent_moderations (id, post_id, input_sha256, prompt_id, agent_id, results, flagged, deleted_at)
    VALUES (
      COALESCE(${id}::uuid, uuidv7()),
      ${options.postId},
      ${inputSha256},
      ${options.promptId},
      ${options.agentId},
      ${JSON.stringify(results)}::jsonb,
      ${flagged},
      ${deletedAt}
    )
    RETURNING id
  `)
  return rows[0].id
}

export async function deleteTestAgentModerations(moderationIds: readonly string[]): Promise<void> {
  if (moderationIds.length === 0) return
  await write(sql`/* deleteTestAgentModerations */
    DELETE FROM agent_moderations
    WHERE id = ANY(${moderationIds}::uuid[])
  `)
}

/** Sets the source-row lifecycle used by trigger-maintained transparency rollups. */
export async function setTestAgentModerationDeletedAt(
  moderationId: string,
  deletedAt: Date | null,
): Promise<void> {
  await write(sql`/* setTestAgentModerationDeletedAt */
    UPDATE agent_moderations
    SET deleted_at = ${deletedAt}
    WHERE id = ${moderationId}::uuid
  `)
}

export async function touchTestAgentModeration(moderationId: string): Promise<void> {
  await write(sql`
    UPDATE agent_moderations
    SET updated_at = updated_at
    WHERE id = ${moderationId}::uuid
  `)
}

export async function setTestAgentModerationTransparencyCategory(
  moderationId: string,
  category: 'agent_moderation' | 'community_ai',
): Promise<void> {
  await write(sql`
    UPDATE agent_moderations
    SET moderation_transparency_category = ${category}
    WHERE id = ${moderationId}::uuid
  `)
}

export async function getTestAgentModerationTransparencyStamp(
  moderationId: string,
): Promise<{ category: string | null; communityId: string | null } | null> {
  const { rows } = await read(sql`
    SELECT moderation_transparency_category AS category,
      moderation_transparency_community_id AS "communityId"
    FROM agent_moderations
    WHERE id = ${moderationId}::uuid
  `)
  return rows[0] ?? null
}

/**
 * Insert a test agent moderation row storing a JSONB boolean (false) as results.
 * This triggers the `!results` early-return path in extractAgentCategories (line 174).
 */
export async function insertTestAgentModerationFalseyResults(options: {
  postId: string
  promptId: string
  agentId: string
}): Promise<void> {
  const inputSha256 = crypto.randomBytes(32)
  await write(sql`
    INSERT INTO agent_moderations (post_id, input_sha256, prompt_id, agent_id, results, flagged)
    VALUES (
      ${options.postId},
      ${inputSha256},
      ${options.promptId},
      ${options.agentId},
      ${'false'}::jsonb,
      false
    )
  `)
}

async function getPostLLMModerationInputSha256(postId: string): Promise<Buffer> {
  const { rows } = await read(sql`
    SELECT llm_moderation_content_sha256
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0]?.llm_moderation_content_sha256 ?? crypto.randomBytes(32)
}

/**
 * Get agent moderations for a post
 */
export async function getPostLLMModerations(postId: string): Promise<unknown[]> {
  const { rows } = await read(sql`
    SELECT
      id,
      input_sha256,
      results,
      flagged,
      prompt_id
    FROM agent_moderations
    WHERE post_id = ${postId}
      AND deleted_at IS NULL
  `)
  return rows
}
