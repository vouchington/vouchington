import { write, type TransactionQuery } from '@data-stores/psql'

/** A later eviction must keep its pending rebuild marker when an older rebuild finishes. */
export async function acknowledgeEmbeddingBloomRebuild(
  retentionGeneration: string,
  query?: TransactionQuery,
): Promise<void> {
  await (query ?? write)(
    `/* acknowledgeEmbeddingBloomRebuild */
    UPDATE bedrock_text_embedding_retention_cursors
    SET is_bloom_rebuild_needed = FALSE
    WHERE is_singleton AND bloom_rebuild_generation = $1::bigint`,
    [retentionGeneration],
  )
}
