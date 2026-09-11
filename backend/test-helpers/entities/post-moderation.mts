import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { setTestPostClearanceStatus } from './post-clearance.mts'

export async function updatePostModerationData(
  postId: string,
  contentSha256: Buffer,
  results: unknown[],
  flagged: boolean,
): Promise<void> {
  await write(sql`
    UPDATE posts
    SET openai_omni_moderation_input_sha256 = ${contentSha256},
      openai_omni_moderation_results = ${JSON.stringify(results)}::jsonb,
      openai_omni_moderation_flagged = ${flagged},
      openai_omni_moderation_created_at = NOW()
    WHERE id = ${postId}
  `)
}

export async function getPostModerationData(postId: string): Promise<unknown | null> {
  const { rows } = await read(sql`
    SELECT
      openai_omni_moderation_content_sha256,
      openai_omni_moderation_input_sha256,
      openai_omni_moderation_results,
      openai_omni_moderation_flagged,
      openai_omni_moderation_created_at
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0] || null
}

export async function getPostLLMModerationContentSha256(postId: string): Promise<Buffer | null> {
  const { rows } = await read(sql`
    SELECT llm_moderation_content_sha256
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0]?.llm_moderation_content_sha256 || null
}

export async function setPostModerationContentSha256(
  postId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(sql`
    UPDATE posts
    SET openai_omni_moderation_content_sha256 = ${contentSha256}
    WHERE id = ${postId}
  `)
}

export async function setPostLLMModerationContentSha256(
  postId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(sql`
    UPDATE posts
    SET llm_moderation_content_sha256 = ${contentSha256}
    WHERE id = ${postId}
  `)
}

export async function getPostSpamDetectionState(postId: string): Promise<{
  spam_detection_flagged: boolean | null
  spam_detection_created_at: Date | null
  spam_detection_score: number | null
  spam_detection_results: unknown | null
} | null> {
  const { rows } = await read(sql`
    SELECT
      spam_detection_flagged,
      spam_detection_created_at,
      spam_detection_score,
      spam_detection_results
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0] || null
}

export async function getPostModerationResetState(postId: string): Promise<{
  latest_clearance_change_id: string | null
  approved_at: Date | null
  rejected_at: Date | null
  in_review_at: Date | null
  spam_detection_flagged: boolean | null
  spam_detection_created_at: Date | null
  spam_detection_score: number | null
  spam_detection_results: unknown | null
  openai_omni_moderation_flagged: boolean | null
  openai_omni_moderation_created_at: Date | null
} | null> {
  const { rows } = await read(sql`
    SELECT latest_clearance_change_id,
      approved_at,
      rejected_at,
      in_review_at,
      spam_detection_flagged,
      spam_detection_created_at,
      spam_detection_score,
      spam_detection_results,
      openai_omni_moderation_flagged,
      openai_omni_moderation_created_at
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0] ?? null
}

export async function setPostSpamDetectionResults(
  postId: string,
  results: Array<{ signal: string; score: number; flagged: boolean; details?: unknown }>,
): Promise<void> {
  await write(sql`
    UPDATE posts
    SET spam_detection_results = ${JSON.stringify(results)}::jsonb,
      spam_detection_flagged = ${results.some(result => result.flagged)},
      spam_detection_score = ${results.reduce((sum, result) => sum + result.score, 0)},
      spam_detection_created_at = NOW()
    WHERE id = ${postId}
  `)
}

export async function markPostFlaggedForModeration(postId: string): Promise<void> {
  await write(sql`
    UPDATE posts
    SET openai_omni_moderation_flagged = TRUE,
      openai_omni_moderation_created_at = NOW()
    WHERE id = ${postId}
  `)
  await setTestPostClearanceStatus(postId, 'rejected')
}

/**
 * Set OpenAI omni-moderation results on a post with a structured categories object.
 * The categories map is { categoryName: boolean } where true = flagged.
 */
export async function setPostOpenAIModerationResults(
  postId: string,
  options: {
    flagged: boolean
    categories: Record<string, boolean>
  },
): Promise<void> {
  // Mirror production: omni-moderation results are stored as an array of result objects.
  const results = [{ flagged: options.flagged, categories: options.categories }]
  await write(sql`
    UPDATE posts
    SET openai_omni_moderation_flagged = ${options.flagged},
      openai_omni_moderation_results = ${JSON.stringify(results)}::jsonb,
      openai_omni_moderation_created_at = NOW()
    WHERE id = ${postId}
  `)
}

/**
 * Set openai_omni_moderation_flagged on a post while leaving results as NULL.
 * Useful for testing the null-results code path in context extractors (line 161).
 */
export async function setPostOpenAIModerationFlaggedOnly(
  postId: string,
  flagged: boolean,
): Promise<void> {
  await write(sql`
    UPDATE posts
    SET openai_omni_moderation_flagged = ${flagged},
      openai_omni_moderation_results = NULL,
      openai_omni_moderation_created_at = NOW()
    WHERE id = ${postId}
  `)
}

/**
 * Set openai_omni_moderation_flagged with a results object that has no categories key.
 * Triggers the !categories early-return path in extractOpenAICategories (line 165).
 */
export async function setPostOpenAIModerationResultsNoCategoryKey(
  postId: string,
  flagged: boolean,
): Promise<void> {
  await write(sql`
    UPDATE posts
    SET openai_omni_moderation_flagged = ${flagged},
      openai_omni_moderation_results = '{}'::jsonb,
      openai_omni_moderation_created_at = NOW()
    WHERE id = ${postId}
  `)
}
