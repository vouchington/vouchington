import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function hasRssFeedItemEmbedding(rss_feed_item_id: string): Promise<boolean> {
  const { rows } = await read(sql`/* hasRssFeedItemEmbedding */
    SELECT 1
    FROM rss_feed_items
    WHERE id = ${rss_feed_item_id}
      AND bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function hasCurrentPostEmbedding(
  post_id: string,
  content_sha256: Buffer,
): Promise<boolean> {
  const { rows } = await read(sql`/* hasCurrentPostEmbedding */
    SELECT 1
    FROM posts
    WHERE id = ${post_id}
      AND bedrock_nova_multimodal_v1_content_sha256 = ${content_sha256}
      AND bedrock_nova_multimodal_v1_input_sha256 = ${content_sha256}
      AND bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function hasCurrentRssFeedItemEmbedding(
  rss_feed_item_id: string,
  content_sha256: Buffer,
): Promise<boolean> {
  const { rows } = await read(sql`/* hasCurrentRssFeedItemEmbedding */
    SELECT 1
    FROM rss_feed_items
    WHERE id = ${rss_feed_item_id}
      AND bedrock_nova_multimodal_v1_content_sha256 = ${content_sha256}
      AND bedrock_nova_multimodal_v1_input_sha256 = ${content_sha256}
      AND bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
    LIMIT 1
  `)
  return rows.length > 0
}
