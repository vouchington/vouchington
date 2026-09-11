import { randomUUID } from 'node:crypto'
import { it, expect, describe } from 'vitest'
import { bloomValkeyClient } from '@data-stores/valkey'
import { BOOKMARK_BLOOM_FILTER_TTL_SECONDS } from '@services/bookmarks/bloom-filter-utils'
import { sweepBookmarkBloomFiltersMissingTtl } from './index.mts'

describe('sweepBookmarkBloomFiltersMissingTtl', () => {
  it('attaches BOOKMARK_BLOOM_FILTER_TTL_SECONDS to a live key that has none', async () => {
    const key = `bloom-filter:user-bookmarks:${randomUUID()}`
    await bloomValkeyClient.set(key, 'x')
    try {
      expect(await bloomValkeyClient.ttl(key)).toBe(-1)

      await sweepBookmarkBloomFiltersMissingTtl()

      const ttl = await bloomValkeyClient.ttl(key)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(BOOKMARK_BLOOM_FILTER_TTL_SECONDS)
    } finally {
      await bloomValkeyClient.unlink([key])
    }
  })
})
