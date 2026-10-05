import { randomUUID } from 'node:crypto'
import { write } from '../index.mts'
import { describe, expect, it } from 'vitest'

async function rejectionCode(sql: string, values?: unknown[]): Promise<string | undefined> {
  try {
    await write(sql, values)
  } catch (err) {
    return (err as { code?: string }).code
  }
  return undefined
}

describe('bedrock embedding batch foreign keys', () => {
  it('rejects a batch whose url or crawl does not exist', async () => {
    const missing = randomUUID()
    await expect(
      rejectionCode(
        `/* schemaIngestionRelations */
         INSERT INTO bedrock_embedding_batches (id, model_id, job_type, data, url_id)
         VALUES ($1, 'amazon.nova-2-multimodal-embeddings-v1:0', 'topics', '{}'::jsonb, $2)`,
        [`bedrock-fk-url-${missing}`, missing],
      ),
    ).resolves.toBe('23503')
    await expect(
      rejectionCode(
        `/* schemaIngestionRelations */
         INSERT INTO bedrock_embedding_batches (id, model_id, job_type, data, crawl_id)
         VALUES ($1, 'amazon.nova-2-multimodal-embeddings-v1:0', 'topics', '{}'::jsonb, $2)`,
        [`bedrock-fk-crawl-${missing}`, missing],
      ),
    ).resolves.toBe('23503')
  })
})
