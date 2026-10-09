import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ValkeyBloomFilter, bloomValkeyClient } from '@data-stores/valkey'
import { suppressedError } from '@voucha/test-helpers/suppressed-error'
import { addEntityBloomKeys, checkEntityBloomKeys } from './bloom-filter-repair.mts'
import { EntityBloomCache } from './entity-bloom-cache.mts'

describe('entity Bloom completeness', () => {
  it('invalidates completeness once after a failed add and reads fall back to current state', async () => {
    const name = `entity-repair-${randomUUID()}`
    const filter = new ValkeyBloomFilter({
      name,
      capacity: 100,
      errorRate: 0.01,
      client: bloomValkeyClient,
    })
    const readyKey = `bloom-filter:${name}:ready`
    const enqueueRebuild = vi.fn<() => Promise<void>>().mockResolvedValue()
    const target = { filter, readyKey, enqueueRebuild }
    await filter.rebuild(['existing'])
    await bloomValkeyClient.set(readyKey, '1')
    const failingTarget = {
      ...target,
      filter: {
        mexistsIfReady: (marker: string, keys: string[]) => filter.mexistsIfReady(marker, keys),
        addOrThrow: async () => {
          throw suppressedError('owned add failure')
        },
      },
    }
    try {
      await addEntityBloomKeys('users', ['new-user'], failingTarget)
      await addEntityBloomKeys('users', ['another-user'], failingTarget)
      expect(enqueueRebuild).toHaveBeenCalledTimes(1)
      expect(await bloomValkeyClient.get(readyKey)).toBeNull()
      await expect(checkEntityBloomKeys('users', ['new-user'], target)).resolves.toEqual([null])
      expect(enqueueRebuild).toHaveBeenCalledTimes(2)
      const cache = new EntityBloomCache(
        'users',
        { prefix: name, ttlSeconds: 60 },
        { enabled: () => true, target },
      )
      const fetch = vi
        .fn<(key: string) => Promise<{ id: string }>>()
        .mockImplementation(async id => ({ id }))
      await expect(cache.cacheGetByAny(fetch)('new-user')).resolves.toEqual({ id: 'new-user' })
      expect(fetch).toHaveBeenCalledOnce()
      await cache.delete('new-user')
      await filter.rebuild(['existing', 'new-user'])
      await bloomValkeyClient.set(readyKey, '1')
      await expect(checkEntityBloomKeys('users', ['new-user', 'absent'], target)).resolves.toEqual([
        true,
        false,
      ])
      await expect(cache.cacheGetByAny(fetch)('absent')).resolves.toBeNull()
      expect(fetch).toHaveBeenCalledOnce()
    } finally {
      await filter.deleteWithAdditionalKeys([readyKey])
    }
  })
})
