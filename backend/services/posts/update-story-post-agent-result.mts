import { beginTransaction } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueCreatePostEmbedding } from '@queues/bedrock-embeddings/enqueues'
import { admitAutomatedPostModeration, resetPostClearance } from '@services/post-clearance'
import sql from 'sql-template-strings'
import { createPostTextEmbeddingContent, createPostModerationContent } from './content.mts'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

export async function updateStoryPostAgentResult(
  postId: string,
  _postTitle: string,
  aiSummaryMarkdown: string,
): Promise<void> {
  await using query = await beginTransaction()
  const updated = await updatePostInTransaction()
  await query.commit()
  if (!updated) return

  // Re-enqueue downstream workers so they pick up the new ai_summary_markdown content.
  await Promise.all([enqueueCreatePostEmbedding(postId), admitAutomatedPostModeration(postId)])

  await invalidate.posts(postId)

  async function updatePostInTransaction(): Promise<boolean> {
    await lockPostPublication(query, postId)
    const { rows: postRows } = await query<{
      title: string | null
      markdown: string | null
      structured_data: unknown
      images: Array<{ image_id: string; order_index: number; caption?: string }> | null
    }>(sql`/* updateStoryPostAgentResult */
      SELECT
        title,
        markdown,
        structured_data,
        COALESCE((
          SELECT JSON_AGG(
            jsonb_build_object(
              'image_id', post_images.image_id,
              'order_index', post_images.order_index,
              'caption', post_images.caption
            )
            ORDER BY post_images.order_index
          )
          FROM post_images
          JOIN images ON images.id = post_images.image_id
            AND images.deleted_at IS NULL
            AND images.upload_completed_at IS NOT NULL
            AND images.quarantine_pending_at IS NULL
          WHERE post_images.post_id = posts.id
        ), '[]'::json) AS images
      FROM posts
      WHERE id = ${postId} AND post_type = 'story'
      FOR UPDATE
    `)
    const post = postRows[0]
    if (!post) return false
    const currentTitle = post.title ?? ''
    const currentMarkdown = post.markdown ?? ''
    const embeddingContentSha = createPostTextEmbeddingContent({
      title: currentTitle,
      markdown: currentMarkdown,
      structured_data: post.structured_data,
      ai_summary_markdown: aiSummaryMarkdown,
    }).content_sha256
    const moderationContentSha = createPostModerationContent({
      title: currentTitle,
      markdown: currentMarkdown,
      structured_data: post.structured_data,
      ai_summary_markdown: aiSummaryMarkdown,
      images: post.images ?? [],
    }).content_sha256
    const { rows } = await query<{ id: string }>(sql`/* updateStoryPostAgentResult */
    UPDATE posts
    SET ai_summary_markdown = ${aiSummaryMarkdown},
        bedrock_nova_multimodal_v1_content_sha256 = ${embeddingContentSha},
        llm_moderation_content_sha256 = ${moderationContentSha}
    WHERE id = ${postId} AND post_type = 'story'
    RETURNING id`)
    if (!rows[0]) return false
    await resetPostClearance(postId, null, { query })
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId },
      reason: 'post_content_reset',
    })
    return true
  }
}
