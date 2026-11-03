import { afterEach, describe, expect, it, vi } from 'vitest'
import * as bloomEnqueues from '@queues/bloom-filters/enqueues'
import * as urlBloomFilter from '@services/urls-domains-blacklist/bloom-filter'
import * as emailBloomFilter from '@services/urls-domains-blacklist/email-bloom-filter'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { rebuildBloomForSource } from './sync-bloom.mts'

describe('rebuildBloomForSource', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['url', 'email'] as const)(
    'invalidates the %s ready marker before queueing its rebuild',
    async sourceType => {
      const filter = `${sourceType}-blocklist` as const
      const calls: string[] = []
      const realInvalidateUrl = urlBloomFilter.invalidateUrlBlocklistReadyMarker
      vi.spyOn(urlBloomFilter, 'invalidateUrlBlocklistReadyMarker').mockImplementation(async () => {
        calls.push('invalidate-url')
        return realInvalidateUrl()
      })
      const realInvalidateEmail = emailBloomFilter.invalidateEmailBlocklistReadyMarker
      vi.spyOn(emailBloomFilter, 'invalidateEmailBlocklistReadyMarker').mockImplementation(
        async () => {
          calls.push('invalidate-email')
          return realInvalidateEmail()
        },
      )
      const realEnqueue = bloomEnqueues.enqueueRebuildBloomFilter
      vi.spyOn(bloomEnqueues, 'enqueueRebuildBloomFilter').mockImplementation((data, priority) => {
        calls.push(`enqueue ${data.filter}`)
        return realEnqueue(data, priority)
      })

      await rebuildBloomForSource(sourceType)

      expect(calls).toEqual([`invalidate-${sourceType}`, `enqueue ${filter}`])
    },
  )

  it.each(['url', 'email'] as const)(
    'still queues the %s rebuild when the generation bump fails',
    async sourceType => {
      const filter = `${sourceType}-blocklist` as const
      const bumpFailure = new Error('bump failed')
      const restoreWrite = rejectPostgresWriteForTest(
        '/* bumpBlocklistBloomGeneration */',
        bumpFailure,
      )
      const enqueue = vi.spyOn(bloomEnqueues, 'enqueueRebuildBloomFilter')

      try {
        await expect(rebuildBloomForSource(sourceType)).rejects.toBe(bumpFailure)
      } finally {
        restoreWrite()
      }

      expect(enqueue).toHaveBeenCalledExactlyOnceWith({ filter })
    },
  )
})
