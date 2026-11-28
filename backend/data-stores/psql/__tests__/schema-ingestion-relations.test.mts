import { randomUUID } from 'node:crypto'
import { mintUuidv7 } from '@modules/utils/ids'
import { describe, expect, it } from 'vitest'
import { getBedrockEmbeddingBatchMissingForeignKeyCode } from '../../../test-helpers/data-stores/psql/schema-ingestion-relations.mts'

describe('bedrock embedding batch foreign keys', () => {
  it('rejects a batch whose url or crawl does not exist', async () => {
    const missing = randomUUID()
    await expect(
      getBedrockEmbeddingBatchMissingForeignKeyCode('url_id', mintUuidv7(), missing),
    ).resolves.toBe('23503')
    await expect(
      getBedrockEmbeddingBatchMissingForeignKeyCode('crawl_id', mintUuidv7(), missing),
    ).resolves.toBe('23503')
  })
})
