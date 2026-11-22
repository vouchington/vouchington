import type { TransactionQuery } from '@data-stores/psql'

export async function deleteEmbeddingBatchForRetentionTest(
  query: TransactionQuery,
  id: string,
): Promise<void> {
  await query(
    `/* deleteEmbeddingBatchForRetentionTest */
    DELETE FROM bedrock_embedding_batches WHERE id = $1::uuid`,
    [id],
  )
}
