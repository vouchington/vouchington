import { it, expect, afterEach, beforeEach, describe } from 'vitest'
import {
  addEmbeddingHashesToBloomFilter,
  embeddingBloomFilter,
  EMBEDDING_BLOOM_READY_KEY,
} from './bloom-filter.mts'
import { bloomValkeyClient } from '@data-stores/valkey'

describe('bloom-filter.generated (bedrock embeddings)', () => {
  beforeEach(async () => {
    await embeddingBloomFilter.deleteWithAdditionalKeys([EMBEDDING_BLOOM_READY_KEY])
  })

  afterEach(async () => {
    await embeddingBloomFilter.deleteWithAdditionalKeys([EMBEDDING_BLOOM_READY_KEY])
  })

  it('addEmbeddingHashesToBloomFilter swallows error and unlinks ready marker when bloom key is corrupted', async () => {
    // Corrupt the live Valkey key (bloom-filter:<name>) with a string — BF.MADD throws WRONGTYPE
    await bloomValkeyClient.set('bloom-filter:bedrock-nova-2-multimodal-embeddings-v1', 'corrupted')
    // Should resolve without throwing — error recovery is internal
    await expect(addEmbeddingHashesToBloomFilter(['abc123'])).resolves.toBeUndefined()
  })
})
