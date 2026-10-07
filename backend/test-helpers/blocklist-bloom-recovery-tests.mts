/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { expect, test } from 'vitest'
import { bloomValkeyClient } from '@data-stores/valkey'
import type {
  BlocklistBloomAddTarget,
  BlocklistBloomFilterReadTarget,
} from '../services/urls-domains-blacklist/blocklist-bloom-add.mts'
import { withOwnedBlocklistBloomFilter } from './owned-blocklist-bloom-filter.mts'

type BlocklistFilterName = 'url-blocklist' | 'email-blocklist'

/** Shared URL and email blocklist recovery cases. Call from a literal `describe`. */
export function registerOwnedBlocklistBloomRecoveryTests(options: {
  filter: BlocklistFilterName
  check: (domain: string, target: BlocklistBloomFilterReadTarget) => Promise<boolean | null>
  add: (domains: string[], target: BlocklistBloomAddTarget) => Promise<void>
  wasRebuildEnqueued: () => boolean
  settleRebuildEnqueues: () => Promise<void>
}): void {
  test('check returns null when the ready marker is not readable', async () => {
    await withOwnedBlocklistBloomFilter(options.filter, async ({ readyKey, readTarget }) => {
      await bloomValkeyClient.customCommand(['LPUSH', readyKey, 'not-a-string-marker'])

      const result = await options.check('wrong-ready-type.com', readTarget)

      expect(result).toBeNull()
      expect(options.wasRebuildEnqueued()).toBe(true)
      await options.settleRebuildEnqueues()
    })
  })

  test('check keeps the ready marker valid when missing-filter repair runs', async () => {
    await withOwnedBlocklistBloomFilter(options.filter, async ({ readyKey, readTarget }) => {
      await bloomValkeyClient.set(readyKey, '1')

      const result = await options.check('missing-filter.com', readTarget)

      expect(options.wasRebuildEnqueued()).toBe(true)
      await options.settleRebuildEnqueues()
      expect(result).toBeNull()
      const readyMarker = await bloomValkeyClient.get(readyKey)
      expect(readyMarker == null || readyMarker.toString().startsWith('ready:')).toBe(true)
    })
  })

  test('check keeps the ready marker valid when corrupted-filter repair runs', async () => {
    await withOwnedBlocklistBloomFilter(
      options.filter,
      async ({ bloomFilter, readyKey, readTarget }) => {
        await bloomValkeyClient.set(readyKey, '1')
        await bloomValkeyClient.set(bloomFilter.getKey(), 'corrupted')

        const result = await options.check('corrupted-filter.com', readTarget)

        expect(options.wasRebuildEnqueued()).toBe(true)
        await options.settleRebuildEnqueues()
        expect(result).toBeNull()
        const readyMarker = await bloomValkeyClient.get(readyKey)
        expect(readyMarker == null || readyMarker.toString().startsWith('ready:')).toBe(true)
      },
    )
  })

  test('add swallows unreadable ready marker recovery errors', async () => {
    await withOwnedBlocklistBloomFilter(
      options.filter,
      async ({ bloomFilter, readyKey, addTarget }) => {
        await bloomValkeyClient.customCommand(['LPUSH', readyKey, 'not-a-string-marker'])
        await bloomValkeyClient.set(bloomFilter.getKey(), 'corrupted')

        await expect(options.add(['blocked.com'], addTarget)).resolves.toBeUndefined()
        expect(options.wasRebuildEnqueued()).toBe(true)
        await options.settleRebuildEnqueues()
        expect(await bloomValkeyClient.customCommand(['TYPE', readyKey])).not.toBe('list')
      },
    )
  })
}
