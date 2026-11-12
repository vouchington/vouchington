import { randomUUID } from 'node:crypto'
import { mintUUIDv7 } from '@modules/utils/ids'
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

describe('gemini embedding batch foreign keys', () => {
  it('rejects a batch whose url or crawl does not exist', async () => {
    const missing = randomUUID()
    await expect(
      rejectionCode(
        `/* schemaIngestionRelations */
         INSERT INTO gemini_embedding_batches (id, model_id, job_type, data, url_id)
         VALUES ($1, 'gemini-embedding-2', 'topics', '{}'::jsonb, $2)`,
        [mintUUIDv7(), missing],
      ),
    ).resolves.toBe('23503')
    await expect(
      rejectionCode(
        `/* schemaIngestionRelations */
         INSERT INTO gemini_embedding_batches (id, model_id, job_type, data, crawl_id)
         VALUES ($1, 'gemini-embedding-2', 'topics', '{}'::jsonb, $2)`,
        [mintUUIDv7(), missing],
      ),
    ).resolves.toBe('23503')
  })
})
