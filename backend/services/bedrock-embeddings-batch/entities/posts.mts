import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { createPostTextEmbeddingContent } from '@services/posts/content'
import type { Post } from '@services/posts/types'
import type { BatchUpdateItem } from '@services/bedrock-embeddings/batch/types'
import { copyExistingEmbeddings, applyBatchUpdates } from '../orchestrator/save.mts'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'
import {
  reusableEmbeddingMissingClause,
  streamPendingEntities,
  type PendingEntity,
} from './shared.mts'
import * as banEvasion from '@services/communities/ban-evasion'

type PendingPost = PendingEntity

export async function copyExistingPostEmbeddings(): Promise<void> {
  const updatedIds = await copyExistingEmbeddings('posts', { excludeDeleted: true })
  await enqueueBanEvasionDetectionAfterCopiedPostEmbeddings(updatedIds)
}

async function enqueueBanEvasionDetectionAfterCopiedPostEmbeddings(updatedIds: string[]) {
  await banEvasion.enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts(updatedIds)
  await banEvasion.enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts()
}

export async function* streamPendingPosts(): AsyncGenerator<PendingPost, void, unknown> {
  const query = `/* streamPendingPosts */
    SELECT
      p.id,
      vp.title,
      vp.markdown,
      vp.post_type,
      vp.ai_summary_markdown,
      vp.topic_recommendation
    FROM posts p
    JOIN view_posts vp ON vp.id = p.id
    WHERE p.deleted_at IS NULL
      AND (
        p.bedrock_nova_multimodal_v1_input_sha256 IS NULL
        OR p.bedrock_nova_multimodal_v1_input_sha256 != p.bedrock_nova_multimodal_v1_content_sha256
      )
      AND ${reusableEmbeddingMissingClause('p')}
      AND NOT ${lockExistsClause('posts', 'p.id')}
    ORDER BY p.id DESC
  `

  yield* streamPendingEntities<{
    id: string
    title: string
    markdown: string
    post_type: string
    ai_summary_markdown?: string
    topic_recommendation?: Post['topic_recommendation']
  }>(createAsyncGeneratorFromCursor(query, [], { batchSize: 1000 }), row =>
    createPostTextEmbeddingContent({
      title: row.title || '',
      markdown: row.markdown || '',
      post_type: row.post_type as Post['post_type'],
      ai_summary_markdown: row.ai_summary_markdown ?? undefined,
      topic_recommendation: row.topic_recommendation ?? undefined,
    }),
  )
}

export async function applyPostBatchUpdates(items: BatchUpdateItem[]): Promise<void> {
  const updatedIds = await applyBatchUpdates('posts', items)
  await banEvasion.enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts(updatedIds)
}
