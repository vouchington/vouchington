import { afterEach, describe, expect, it, vi } from 'vitest'
import * as bloomFilterEnqueues from '@queues/bloom-filters/enqueues'
import { bloomValkeyClient } from '@data-stores/valkey'
import { sentryCaptureExceptionMock as captureException } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { withOwnedBlocklistBloomFilter } from '@voucha/test-helpers/owned-blocklist-bloom-filter'
import * as rebuildEnqueue from './rebuild-enqueue.mts'
import {
  addDomainsToBlocklistBloomFilter,
  blocklistBloomAddTarget,
  repairStaleBlocklistReadyMarker,
} from './blocklist-bloom-add.mts'

describe('blocklist bloom add recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds only domains that normalize', async () => {
    const added: string[] = []
    const target = blocklistBloomAddTarget({
      filter: 'url-blocklist',
      readyKey: 'ready-key',
      liveKey: 'live-key',
      addOrThrow: async domains => {
        added.push(...domains)
      },
    })

    await addDomainsToBlocklistBloomFilter(['  ', '# comment', 'OK.Example'], target)

    expect(added).toEqual(['ok.example'])
  })

  it('leaves the ready marker in place when the live filter exists', async () => {
    const enqueueSpy = vi.spyOn(rebuildEnqueue, 'enqueueRebuildBloomFilterBestEffort')

    await withOwnedBlocklistBloomFilter(
      'url-blocklist',
      async ({ bloomFilter, readyKey, addTarget }) => {
        await bloomFilter.ensureExists()
        await bloomValkeyClient.set(readyKey, 'stale-ready')

        await addTarget.repairStaleReadyMarker()

        expect(enqueueSpy).not.toHaveBeenCalled()
        expect(await bloomValkeyClient.get(readyKey)).toBe('stale-ready')
      },
    )
  })

  it('repairs a readable ready marker when the ready read fails after an add error', async () => {
    const enqueueSpy = vi.spyOn(rebuildEnqueue, 'enqueueRebuildBloomFilterBestEffort')

    await withOwnedBlocklistBloomFilter(
      'url-blocklist',
      async ({ bloomFilter, readyKey, addTarget }) => {
        await bloomValkeyClient.set(readyKey, 'stale-ready')
        await bloomValkeyClient.set(bloomFilter.getKey(), 'corrupted')
        const originalGet = bloomValkeyClient.get
        let rejectedReadyRead = false
        vi.spyOn(bloomValkeyClient, 'get').mockImplementation(key => {
          if (!rejectedReadyRead && key === readyKey) {
            rejectedReadyRead = true
            return Promise.reject(new Error('ready marker unreadable'))
          }
          return originalGet.call(bloomValkeyClient, key)
        })

        await expect(
          addDomainsToBlocklistBloomFilter(['blocked.com'], addTarget),
        ).resolves.toBeUndefined()

        expect(rejectedReadyRead).toBe(true)
        expect(enqueueSpy).toHaveBeenCalledWith('url-blocklist', expect.any(Function))
        await Promise.allSettled(
          enqueueSpy.mock.results.flatMap(result =>
            result.type === 'return' ? [result.value] : [],
          ),
        )
        expect(await bloomValkeyClient.get(readyKey)).toBeNull()
      },
    )
  })

  it('reports a ready-marker read that throws while repairing a stale marker', async () => {
    await withOwnedBlocklistBloomFilter('url-blocklist', async ({ bloomFilter, readyKey }) => {
      await bloomValkeyClient.customCommand(['LPUSH', readyKey, 'not-a-string-marker'])

      await expect(
        repairStaleBlocklistReadyMarker({
          filter: 'url-blocklist',
          readyKey,
          liveKey: bloomFilter.getKey(),
        }),
      ).resolves.toBeUndefined()

      expect(captureException).toHaveBeenCalled()
      expect(await bloomValkeyClient.customCommand(['TYPE', readyKey])).toBe('list')
    })
  })

  it('reports a rebuild enqueue failure without unlinking the ready marker', async () => {
    const enqueueError = new Error('rebuild enqueue failed')
    vi.spyOn(bloomFilterEnqueues, 'enqueueRebuildBloomFilter').mockImplementation(() => {
      throw enqueueError
    })

    await withOwnedBlocklistBloomFilter(
      'url-blocklist',
      async ({ bloomFilter, readyKey, addTarget }) => {
        await bloomValkeyClient.set(readyKey, 'stale-ready')
        await bloomValkeyClient.set(bloomFilter.getKey(), 'corrupted')

        await expect(
          addDomainsToBlocklistBloomFilter(['blocked.com'], addTarget),
        ).resolves.toBeUndefined()

        expect(captureException).toHaveBeenCalledWith(enqueueError, expect.anything())
        expect(await bloomValkeyClient.get(readyKey)).toBe('stale-ready')
      },
    )
  })
})
