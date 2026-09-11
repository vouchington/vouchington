import type { TransactionQuery } from '@data-stores/psql'
import { resetPostClearance } from '@services/post-clearance'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type PostImagePublicationState = {
  title: string
  markdown: string
  structured_data: unknown | null
  ai_summary_markdown: string | null
  openai_omni_moderation_content_sha256: Buffer
  llm_moderation_content_sha256: Buffer
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
}

export async function getLockedPostImagePublicationState(
  query: TransactionQuery,
  postId: string,
): Promise<PostImagePublicationState> {
  const { rows } = await query<PostImagePublicationState>(sql`/* setPostImages */
    SELECT title,
      markdown,
      structured_data,
      ai_summary_markdown,
      openai_omni_moderation_content_sha256,
      llm_moderation_content_sha256,
      latest_clearance_change_id,
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
    FOR UPDATE
  `)
  assert(rows.length > 0, 404, 'Post not found')
  return rows[0]
}

export async function resetPostImageClearance(
  query: TransactionQuery,
  postId: string,
  changedById: string,
): Promise<string | null> {
  await resetPostClearance(postId, changedById, { query })
  const { rows } = await query<{ latest_clearance_change_id: string | null }>(sql`
    /* setPostImages:currentClearance */
    SELECT latest_clearance_change_id
    FROM posts
    WHERE id = ${postId}
  `)
  return rows[0]?.latest_clearance_change_id ?? null
}
