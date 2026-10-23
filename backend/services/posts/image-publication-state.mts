import type { TransactionQuery } from '@data-stores/psql'
import { resetPostClearance } from '@services/post-clearance'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type PostImagePublicationState = {
  title: string
  markdown: string
  structured_data: unknown | null
  ai_summary_markdown: string | null
  llm_moderation_content_sha256: Buffer
  latest_clearance_change_id: string | null
  approved_at: Date | null
  rejected_at: Date | null
  in_review_at: Date | null
  clearance_changed_by_id: string | null
  clearance_public_reason_code: string | null
  clearance_private_note: string | null
  clearance_platform_override: boolean
}

export async function getLockedPostImagePublicationState(
  query: TransactionQuery,
  postId: string,
): Promise<PostImagePublicationState> {
  const { rows } = await query<PostImagePublicationState>(sql`/* setPostImages:publicationState */
    SELECT post.title,
      post.markdown,
      post.structured_data,
      post.ai_summary_markdown,
      post.llm_moderation_content_sha256,
      post.latest_clearance_change_id,
      post.approved_at,
      post.rejected_at,
      post.in_review_at,
      post.clearance_changed_by_id,
      post.clearance_public_reason_code,
      post.clearance_private_note,
      post.clearance_is_platform_override AS clearance_platform_override
    FROM posts post
    WHERE post.id = ${postId}
    FOR UPDATE OF post
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
