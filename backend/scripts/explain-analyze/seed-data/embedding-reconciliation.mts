import { beginTransaction } from '@data-stores/psql'

export async function seedPendingStoryEmbeddingTriggers(): Promise<void> {
  // A sparse late-page cohort makes the partial-index plan observable against the full RSS seed.
  await using transaction = await beginTransaction()
  await transaction(`/* seedPendingStoryEmbeddingTriggers */
    WITH numbered AS (
      SELECT items.id, row_number() OVER (ORDER BY items.id) AS row_index
      FROM rss_feed_items items
      JOIN rss_feed_item_ids ids ON ids.id = items.id
      WHERE ids.guid LIKE 'seed-item-guid-%'
    )
    UPDATE rss_feed_items items
    SET bedrock_nova_multimodal_v1_input_sha256 = items.bedrock_nova_multimodal_v1_content_sha256,
      bedrock_nova_multimodal_v1_embedding = ('[' || repeat('0.1,', 1023) || '0.1]')::vector(1024),
      bedrock_nova_multimodal_v1_embedding_created_at = NOW(),
      story_clustering_embedding_input_sha256 = NULL
    FROM numbered
    WHERE items.id = numbered.id
      AND numbered.row_index BETWEEN 20001 AND 20100`)
  await transaction.commit()
}
