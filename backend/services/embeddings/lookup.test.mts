import { afterEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { cacheValkeyClient } from '@data-stores/valkey'
import { insertTestEmbeddings } from '@voucha/test-helpers'
import { lookupExistingEmbeddings } from './lookup.mts'
import { EMBEDDING_BLOOM_READY_KEY, embeddingBloomFilter } from './bloom-filter/bloom-filter.mts'
import { warmUpEmbeddingBloomFilter } from './bloom-filter/warmup.mts'

describe('lookup', () => {
  afterEach(async () => {
    await embeddingBloomFilter.deleteWithAdditionalKeys([EMBEDDING_BLOOM_READY_KEY])
  })

  describe('lookupExistingEmbeddings', () => {
    it('falls back to PostgreSQL when the bloom filter exists but is not marked ready', async () => {
      const contentSha256 = randomBytes(32)
      await insertTestEmbeddings([{ content_sha256: contentSha256 }])

      await embeddingBloomFilter.ensureExists()
      await cacheValkeyClient.unlink([EMBEDDING_BLOOM_READY_KEY])

      const result = await lookupExistingEmbeddings([contentSha256])

      expect(result.has(contentSha256.toString('hex'))).toBe(true)
    })
  })

  describe('warmUpEmbeddingBloomFilter', () => {
    it('enqueues population when ready marker exists but filter is missing', async () => {
      const contentSha256 = randomBytes(32)
      await insertTestEmbeddings([{ content_sha256: contentSha256 }])
      await cacheValkeyClient.set(EMBEDDING_BLOOM_READY_KEY, '1')

      await expect(warmUpEmbeddingBloomFilter()).resolves.toBeUndefined()
    })
  })
})
