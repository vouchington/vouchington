import { write } from '@data-stores/psql'

export async function getBedrockEmbeddingBatchMissingForeignKeyCode(
  column: 'url_id' | 'crawl_id',
  batchId: string,
  missingForeignKeyId: string,
): Promise<string | undefined> {
  const sql =
    column === 'url_id'
      ? `/* schemaIngestionRelations */
         INSERT INTO bedrock_embedding_batches (id, model_id, job_type, data, url_id)
         VALUES ($1, 'amazon.nova-2-multimodal-embeddings-v1:0', 'topics', '{}'::jsonb, $2)`
      : `/* schemaIngestionRelations */
         INSERT INTO bedrock_embedding_batches (id, model_id, job_type, data, crawl_id)
         VALUES ($1, 'amazon.nova-2-multimodal-embeddings-v1:0', 'topics', '{}'::jsonb, $2)`
  try {
    await write(sql, [batchId, missingForeignKeyId])
  } catch (err) {
    return (err as { code?: string }).code
  }
  return undefined
}
