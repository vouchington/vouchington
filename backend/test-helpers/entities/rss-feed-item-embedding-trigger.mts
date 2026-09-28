import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getRssFeedItemStoryEmbeddingTriggerState(itemId: string): Promise<{
  input_sha256: Buffer | null
  content_sha256: Buffer
  marked_sha256: Buffer | null
} | null> {
  const { rows } = await read<{
    input_sha256: Buffer | null
    content_sha256: Buffer
    marked_sha256: Buffer | null
  }>(sql`/* getRssFeedItemStoryEmbeddingTriggerState */
    SELECT bedrock_nova_multimodal_v1_input_sha256 AS input_sha256,
      bedrock_nova_multimodal_v1_content_sha256 AS content_sha256,
      story_clustering_embedding_input_sha256 AS marked_sha256
    FROM rss_feed_items WHERE id = ${itemId}
  `)
  return rows[0] ?? null
}

export async function setRssFeedItemEmbeddingContentSha256ForTest(
  itemId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(sql`/* setRssFeedItemEmbeddingContentSha256ForTest */
    UPDATE rss_feed_items
    SET bedrock_nova_multimodal_v1_content_sha256 = ${contentSha256}
    WHERE id = ${itemId}
  `)
}

export async function markRssFeedItemStoryEmbeddingTriggerForTest(
  itemId: string,
  inputSha256: Buffer,
): Promise<void> {
  await write(sql`/* markRssFeedItemStoryEmbeddingTriggerForTest */
    UPDATE rss_feed_items
    SET story_clustering_embedding_input_sha256 = ${inputSha256}
    WHERE id = ${itemId}
  `)
}
