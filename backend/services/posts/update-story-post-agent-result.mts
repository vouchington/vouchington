import { beginTransaction } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueCreatePostEmbedding } from '@queues/bedrock-embeddings/enqueues'
import { enqueueCreatePostModeration } from '@queues/openai-moderation/enqueues'
import { enqueueSpamDetection } from '@queues/spam-detection/enqueues'
import { resetPostClearance } from '@services/post-clearance'
import sql from 'sql-template-strings'
import { createPostTextEmbeddingContent, createPostModerationContent } from './content.mts'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

export async function updateStoryPostAgentResult(
  postId: string,
  _postTitle: string,
  aiSummaryMarkdown: string,
): Promise<void> {
  await using query = await beginTransaction()
  const moderationUpdate = await updatePostInTransaction()
  await query.commit()
  if (!moderationUpdate) return

  // Re-enqueue downstream workers so they pick up the new ai_summary_markdown content.
  await Promise.all([
    enqueueCreatePostEmbedding(postId),
    enqueueCreatePostModeration(postId, {
      deduplicationKey: moderationUpdate.moderationDeduplicationKey,
    }),
    enqueueSpamDetection(postId, {
      contentSha256: moderationUpdate.moderationContentSha,
      deduplicationKey: moderationUpdate.moderationDeduplicationKey,
    }),
  ])

  await invalidate.posts(postId)

  async function updatePostInTransaction(): Promise<{
    moderationContentSha: Buffer
    moderationDeduplicationKey: string
  } | null> {
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
    if (!post) return null
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
    const { rows } = await query<{ updated_at: Date }>(sql`/* updateStoryPostAgentResult */
    UPDATE posts
    SET ai_summary_markdown = ${aiSummaryMarkdown},
        bedrock_nova_multimodal_v1_content_sha256 = ${embeddingContentSha},
        llm_moderation_content_sha256 = ${moderationContentSha},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${postId} AND post_type = 'story'
    RETURNING updated_at`)
    const updatedPost = rows[0]
    if (!updatedPost) return null
    await resetPostClearance(postId, null, { query })
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId },
      reason: 'post_content_reset',
    })
    return {
      moderationContentSha,
      moderationDeduplicationKey: `${moderationContentSha.toString('hex')}_${updatedPost.updated_at.getTime()}`,
    }
  }
}
