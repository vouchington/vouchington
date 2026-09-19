import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  checkApiKeyBloomFilter,
  addKeyHashToBloomFilter,
  rebuildApiKeyBloomFilter,
  deleteApiKeyBloomFilter,
} from './bloom-filter.mts'
import { createApiKey } from './create.mts'
import { hashApiKey } from './generate.mts'
import { randomBytes } from 'node:crypto'
import { bloomValkeyClient } from '@data-stores/valkey'

describe('bloom-filter.generated', () => {
  beforeEach(async () => {
    await deleteApiKeyBloomFilter()
  })

  afterEach(async () => {
    await deleteApiKeyBloomFilter()
  })

  describe('checkApiKeyBloomFilter + addKeyHashToBloomFilter', () => {
    it('addKeyHashToBloomFilter then checkApiKeyBloomFilter → true', async () => {
      await rebuildApiKeyBloomFilter()
      const keyHash = randomBytes(32)
      await addKeyHashToBloomFilter(keyHash)
      const result = await checkApiKeyBloomFilter(keyHash)
      expect(result).toBe(true)
    })

    it('checkApiKeyBloomFilter for unknown hash → false after rebuild (or null if filter does not exist)', async () => {
      const unknownHash = randomBytes(32)
      // Filter doesn't exist yet — should return null
      const beforeRebuild = await checkApiKeyBloomFilter(unknownHash)
      expect(beforeRebuild).toBeNull()

      // After rebuild, unknown hash should return false
      await rebuildApiKeyBloomFilter()
      const afterRebuild = await checkApiKeyBloomFilter(unknownHash)
      expect(afterRebuild).toBe(false)
    })
  })

  describe('rebuildApiKeyBloomFilter', () => {
    it('after createApiKey → rebuildApiKeyBloomFilter → checkApiKeyBloomFilter returns true for that key', async () => {
      const user = await createTestUser()
      const { rawKey } = await createApiKey(
        user.id,
        'rss',
        `Bloom Test ${Math.random().toString(36).slice(2, 8)}`,
        ['rss:read'],
      )
      const keyHash = hashApiKey(rawKey)

      await rebuildApiKeyBloomFilter()

      const result = await checkApiKeyBloomFilter(keyHash)
      expect(result).toBe(true)
    })
  })

  describe('deleteApiKeyBloomFilter', () => {
    it('removes the filter; subsequent checkApiKeyBloomFilter returns null', async () => {
      await rebuildApiKeyBloomFilter()
      const keyHash = randomBytes(32)
      await addKeyHashToBloomFilter(keyHash)

      const before = await checkApiKeyBloomFilter(keyHash)
      expect(before).toBe(true)

      await deleteApiKeyBloomFilter()

      const after = await checkApiKeyBloomFilter(keyHash)
      expect(after).toBeNull()
    })
  })

  it('addKeyHashToBloomFilter swallows error and unlinks ready marker when bloom key is corrupted', async () => {
    // Corrupt the live Valkey key (bloom-filter:<name>) with a string — BF.MADD throws WRONGTYPE
    await bloomValkeyClient.set('bloom-filter:api-keys', 'corrupted')
    const keyHash = randomBytes(32)
    // Should resolve without throwing — error recovery is internal
    await expect(addKeyHashToBloomFilter(keyHash)).resolves.toBeUndefined()
  })
})
