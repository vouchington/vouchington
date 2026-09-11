import { describe, it, expect, afterEach, vi } from 'vitest'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import {
  bloomValkeyClient,
  cacheValkeyClient,
  dynamicConfigValkeyClient,
  rateLimiterValkeyClient,
} from '@data-stores/valkey/clients'
import * as clearCacheModule from './clear-cache.mts'
import { FLUSH_CONCERNS, flushConcern, type FlushConcern } from './flush.mts'

const { scanAndUnlinkKeysMock } = vi.hoisted(() => ({
  scanAndUnlinkKeysMock: vi.fn<typeof import('valkyries').scanAndUnlinkKeys>(),
}))

vi.mock<typeof import('valkyries')>(import('valkyries'), async importOriginal => ({
  ...(await importOriginal()),
  scanAndUnlinkKeys: scanAndUnlinkKeysMock,
}))

const clearAllCachesMock = vi.spyOn(clearCacheModule, 'clearAllCaches')
const rateLimiterInvalidateMock = vi.spyOn(RateLimiter, 'invalidate')

describe('FLUSH_CONCERNS', () => {
  it('lists every supported concern in the documented order', () => {
    expect(FLUSH_CONCERNS).toEqual([
      'caches',
      'recently-viewed',
      'blooms',
      'rate-limiter',
      'dynamic-config',
      'sessions',
      'queues',
    ])
  })
})

describe('flushConcern', () => {
  it('requires force: true to flush sessions', async () => {
    await expect(flushConcern('sessions')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects an unknown concern with status 400', async () => {
    await expect(
      flushConcern('not-a-real-concern' as Exclude<FlushConcern, 'queues'>),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects the queues concern, which is only handled at the API layer', async () => {
    await expect(flushConcern('queues' as Exclude<FlushConcern, 'queues'>)).rejects.toMatchObject({
      status: 400,
    })
  })

  // The dispatch branches below are exercised with the underlying mechanisms mocked out, rather
  // than for real: each one wipes an entire real Valkey keyspace by design, and other test files
  // running concurrently in this shared, parallel suite depend on real keys under these same
  // prefixes. `valkyries` owns the reusable SCAN+UNLINK contract; here we only verify that
  // `flushConcern` dispatches its application-specific prefixes to that mechanism.
  describe('dispatch (mocked mechanisms)', () => {
    afterEach(() => {
      clearAllCachesMock.mockReset()
      scanAndUnlinkKeysMock.mockReset()
      rateLimiterInvalidateMock.mockReset()
    })

    it('delegates the caches concern to clearAllCaches with no key count', async () => {
      clearAllCachesMock.mockResolvedValue(undefined)

      const result = await flushConcern('caches')

      expect(clearAllCachesMock).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ concern: 'caches', keysRemoved: null })
    })

    it('reports and rethrows a caches failure', async () => {
      const error = new Error('caches boom')
      clearAllCachesMock.mockRejectedValue(error)

      await expect(flushConcern('caches')).rejects.toBe(error)
    })

    it('does not start an atomic flush when already cancelled', async () => {
      const controller = new AbortController()
      const reason = new Error('cancel before caches')
      controller.abort(reason)

      await expect(flushConcern('caches', { signal: controller.signal })).rejects.toBe(reason)
      expect(clearAllCachesMock).not.toHaveBeenCalled()
    })

    it('does not report success when cancellation arrives during an atomic flush', async () => {
      const controller = new AbortController()
      const reason = new Error('cancel during caches')
      clearAllCachesMock.mockImplementation(async () => {
        controller.abort(reason)
      })

      await expect(flushConcern('caches', { signal: controller.signal })).rejects.toBe(reason)
      expect(clearAllCachesMock).toHaveBeenCalledOnce()
    })

    it('scans and unlinks the recently-viewed prefix on the cache client', async () => {
      scanAndUnlinkKeysMock.mockResolvedValue({ scannedKeys: 3, matchedKeys: 3, unlinkedKeys: 3 })

      const result = await flushConcern('recently-viewed')

      expect(scanAndUnlinkKeysMock).toHaveBeenCalledTimes(1)
      expect(scanAndUnlinkKeysMock).toHaveBeenCalledWith(cacheValkeyClient, 'recently-viewed:*', {
        signal: undefined,
      })
      expect(result).toEqual({ concern: 'recently-viewed', keysRemoved: 3 })
    })

    it('scans and unlinks both the bloom-filter and bookmark-bloom-ready prefixes on the bloom client', async () => {
      scanAndUnlinkKeysMock
        .mockResolvedValueOnce({ scannedKeys: 5, matchedKeys: 5, unlinkedKeys: 5 })
        .mockResolvedValueOnce({ scannedKeys: 2, matchedKeys: 2, unlinkedKeys: 2 })

      const result = await flushConcern('blooms')

      expect(scanAndUnlinkKeysMock).toHaveBeenCalledTimes(2)
      expect(scanAndUnlinkKeysMock).toHaveBeenCalledWith(bloomValkeyClient, 'bloom-filter:*', {
        signal: undefined,
      })
      expect(scanAndUnlinkKeysMock).toHaveBeenCalledWith(
        bloomValkeyClient,
        'bookmark-bloom-ready:*',
        { signal: undefined },
      )
      expect(result).toEqual({ concern: 'blooms', keysRemoved: 7 })
    })

    it('scans and unlinks the dynamic-config prefix on the dynamic-config client', async () => {
      scanAndUnlinkKeysMock.mockResolvedValue({ scannedKeys: 2, matchedKeys: 2, unlinkedKeys: 2 })

      const result = await flushConcern('dynamic-config')

      expect(scanAndUnlinkKeysMock).toHaveBeenCalledWith(
        dynamicConfigValkeyClient,
        'dynamic-config:*',
        { signal: undefined },
      )
      expect(result).toEqual({ concern: 'dynamic-config', keysRemoved: 2 })
    })

    it('reports and rethrows a scan-based concern failure', async () => {
      const error = new Error('scan boom')
      scanAndUnlinkKeysMock
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ scannedKeys: 1, matchedKeys: 1, unlinkedKeys: 1 })

      await expect(flushConcern('blooms')).rejects.toBe(error)
    })

    it('delegates the rate-limiter concern to a global RateLimiter.invalidate', async () => {
      rateLimiterInvalidateMock.mockResolvedValue(undefined)

      const result = await flushConcern('rate-limiter')

      expect(rateLimiterInvalidateMock).toHaveBeenCalledTimes(1)
      expect(rateLimiterInvalidateMock).toHaveBeenCalledWith('', rateLimiterValkeyClient)
      expect(result).toEqual({ concern: 'rate-limiter', keysRemoved: null })
    })

    it('reports and rethrows a rate-limiter failure', async () => {
      const error = new Error('rate-limiter boom')
      rateLimiterInvalidateMock.mockRejectedValue(error)

      await expect(flushConcern('rate-limiter')).rejects.toBe(error)
    })

    it('does not start rate-limiter invalidation when already cancelled', async () => {
      const controller = new AbortController()
      const reason = new Error('cancel before rate limiter')
      controller.abort(reason)

      await expect(flushConcern('rate-limiter', { signal: controller.signal })).rejects.toBe(reason)
      expect(rateLimiterInvalidateMock).not.toHaveBeenCalled()
    })

    it('scans and unlinks every session prefix when forced', async () => {
      scanAndUnlinkKeysMock.mockResolvedValue({ scannedKeys: 1, matchedKeys: 1, unlinkedKeys: 1 })

      const result = await flushConcern('sessions', { force: true })

      expect(scanAndUnlinkKeysMock).toHaveBeenCalledTimes(9)
      expect(result).toEqual({ concern: 'sessions', keysRemoved: 9 })
    })

    it('combines 2+ session-prefix failures into an AggregateError without losing the successful counts', async () => {
      const errorA = new Error('prefix A boom')
      const errorB = new Error('prefix B boom')
      scanAndUnlinkKeysMock
        .mockResolvedValueOnce({ scannedKeys: 1, matchedKeys: 1, unlinkedKeys: 1 })
        .mockRejectedValueOnce(errorA)
        .mockResolvedValueOnce({ scannedKeys: 1, matchedKeys: 1, unlinkedKeys: 1 })
        .mockRejectedValueOnce(errorB)
        .mockResolvedValue({ scannedKeys: 1, matchedKeys: 1, unlinkedKeys: 1 })

      await expect(flushConcern('sessions', { force: true })).rejects.toMatchObject({
        errors: [errorA, errorB],
      })
      expect(scanAndUnlinkKeysMock).toHaveBeenCalledTimes(9)
    })

    it('stops starting session-prefix deletion after cancellation', async () => {
      const controller = new AbortController()
      const reason = new Error('cancel session flush')
      scanAndUnlinkKeysMock.mockImplementationOnce(async () => {
        controller.abort(reason)
        return { scannedKeys: 1, matchedKeys: 1, unlinkedKeys: 1 }
      })

      await expect(
        flushConcern('sessions', { force: true, signal: controller.signal }),
      ).rejects.toBe(reason)
      expect(scanAndUnlinkKeysMock).toHaveBeenCalledOnce()
    })
  })
})
