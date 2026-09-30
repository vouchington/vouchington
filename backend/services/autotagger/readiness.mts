import type { OwnedTransaction } from '@data-stores/psql'
import {
  approvedPostRequestEligibility,
  type ClassifierRunSubject,
} from '@services/classifier-runs'
import sql, { type SQLStatement } from 'sql-template-strings'

/** The subject's current embedding was built from its current content (a candidate search needs it). */
function currentEmbedding(alias: string): string {
  return `${alias}.bedrock_nova_multimodal_v1_input_sha256 = ${alias}.bedrock_nova_multimodal_v1_content_sha256
    AND ${alias}.bedrock_nova_multimodal_v1_embedding IS NOT NULL
    AND ${alias}.bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL`
}

/** Reservation-time gate: a candidate search before the embedding exists would find nothing. */
export async function hasCurrentAutotaggerEmbedding(
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
): Promise<boolean> {
  const { rows } =
    subject.postId !== null
      ? await query(
          sql`/* hasCurrentAutotaggerPostEmbedding */
          SELECT 1 FROM posts subject WHERE subject.id = ${subject.postId} AND `.append(
            currentEmbedding('subject'),
          ),
        )
      : await query(
          sql`/* hasCurrentAutotaggerFeedItemEmbedding */
          SELECT 1 FROM rss_feed_items subject WHERE subject.id = ${subject.rssFeedItemId} AND `.append(
            currentEmbedding('subject'),
          ),
        )
  return rows.length > 0
}

/**
 * Sweep filter over `request`: the subject is still live at the requested content and its embedding
 * exists, so the embedding wait never spends a sweep enqueue. Discoverability and tier caps are not
 * part of it; an ineligible subject is dispatched once and settles as no work.
 */
export function autotaggerRequestEligibility(): SQLStatement {
  return approvedPostRequestEligibility(sql`AND `.append(currentEmbedding('post')))
    .append(sql` OR EXISTS (
      SELECT 1 FROM rss_feed_items item
      WHERE item.id = request.rss_feed_item_id AND item.deleted_at IS NULL
        AND item.bedrock_nova_multimodal_v1_content_sha256 = request.input_sha256
        AND `)
    .append(currentEmbedding('item'))
    .append(')')
}
