import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunSubject } from '@services/classifier-runs'
import sql, { type SQLStatement } from 'sql-template-strings'

/** The item's embedding was built from its current content (a candidate search needs it). */
function currentEmbedding(alias: string): string {
  return `${alias}.bedrock_nova_multimodal_v1_input_sha256 = ${alias}.bedrock_nova_multimodal_v1_content_sha256
    AND ${alias}.bedrock_nova_multimodal_v1_embedding IS NOT NULL
    AND ${alias}.bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL`
}

/** Reservation-time gate: a neighbor search before the embedding exists would find nothing. */
export async function hasCurrentStoryClusteringEmbedding(
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
): Promise<boolean> {
  if (subject.rssFeedItemId === null) return false
  const { rows } = await query(
    sql`/* hasCurrentStoryClusteringEmbedding */
    SELECT 1 FROM rss_feed_items subject WHERE subject.id = ${subject.rssFeedItemId} AND `.append(
      currentEmbedding('subject'),
    ),
  )
  return rows.length > 0
}

/**
 * Sweep filter over `request`: the item is still live at the requested content and its embedding
 * exists, so the embedding wait never spends a sweep enqueue. Whether the item can still cluster
 * (already in a story, locked, not discoverable, no neighbors) is decided once at reservation and
 * settles the request as no work.
 */
export function storyClusteringRequestEligibility(): SQLStatement {
  return sql`EXISTS (
      SELECT 1 FROM rss_feed_items item
      WHERE item.id = request.rss_feed_item_id AND item.deleted_at IS NULL
        AND item.bedrock_nova_multimodal_v1_content_sha256 = request.input_sha256
        AND `
    .append(currentEmbedding('item'))
    .append(')')
}
