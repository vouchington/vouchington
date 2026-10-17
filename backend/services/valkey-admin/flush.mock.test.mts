import { describe, it, expect, afterEach, vi } from 'vitest'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import {
  bloomValkeyClient,
  cacheValkeyClient,
  dynamicConfigValkeyClient,
  rateLimiterValkeyClient,
  sessionValkeyClient,
} from '@data-stores/valkey/clients'
import * as clearCacheModule from './clear-cache.mts'
import { FLUSH_CONCERNS } from './concerns.mts'
import { SERVICE_FLUSH_TARGET_PREFIXES } from './flush-targets.mts'
import { flushConcern, type FlushConcern } from './flush.mts'

const { scanAndUnlinkKeyPrefixesMock } = vi.hoisted(() => ({
  scanAndUnlinkKeyPrefixesMock: vi.fn<typeof import('valkyries').scanAndUnlinkKeyPrefixes>(),
}))

vi.mock<typeof import('valkyries')>(import('valkyries'), async importOriginal => ({
  ...(await importOriginal()),
  scanAndUnlinkKeyPrefixes: scanAndUnlinkKeyPrefixesMock,
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
      scanAndUnlinkKeyPrefixesMock.mockReset()
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

    it('unlinks the recently-viewed prefix on the cache client', async () => {
      scanAndUnlinkKeyPrefixesMock.mockResolvedValue({ unlinkedKeys: 3 })

      const result = await flushConcern('recently-viewed')

      expect(scanAndUnlinkKeyPrefixesMock).toHaveBeenCalledOnce()
      expect(scanAndUnlinkKeyPrefixesMock).toHaveBeenCalledWith(
        cacheValkeyClient,
        SERVICE_FLUSH_TARGET_PREFIXES['recently-viewed'],
        { signal: undefined },
      )
      expect(result).toEqual({ concern: 'recently-viewed', keysRemoved: 3 })
    })

    it('unlinks both bloom prefixes on the bloom client in one call', async () => {
      scanAndUnlinkKeyPrefixesMock.mockResolvedValue({ unlinkedKeys: 7 })

      const result = await flushConcern('blooms')

      expect(scanAndUnlinkKeyPrefixesMock).toHaveBeenCalledOnce()
      expect(scanAndUnlinkKeyPrefixesMock).toHaveBeenCalledWith(
        bloomValkeyClient,
        ['bloom-filter:', 'bookmark-bloom-ready:'],
        { signal: undefined },
      )
      expect(result).toEqual({ concern: 'blooms', keysRemoved: 7 })
    })

    it('unlinks the dynamic-config prefix on the dynamic-config client', async () => {
      scanAndUnlinkKeyPrefixesMock.mockResolvedValue({ unlinkedKeys: 2 })

      const result = await flushConcern('dynamic-config')

      expect(scanAndUnlinkKeyPrefixesMock).toHaveBeenCalledWith(
        dynamicConfigValkeyClient,
        ['dynamic-config:'],
        { signal: undefined },
      )
      expect(result).toEqual({ concern: 'dynamic-config', keysRemoved: 2 })
    })

    it('rethrows a scan-based concern failure without reporting it again', async () => {
      const error = new Error('scan boom')
      scanAndUnlinkKeyPrefixesMock.mockRejectedValueOnce(error)

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

    it('unlinks every session prefix on the session client when forced', async () => {
      const controller = new AbortController()
      scanAndUnlinkKeyPrefixesMock.mockResolvedValue({ unlinkedKeys: 9 })

      const result = await flushConcern('sessions', { force: true, signal: controller.signal })

      expect(scanAndUnlinkKeyPrefixesMock).toHaveBeenCalledOnce()
      expect(scanAndUnlinkKeyPrefixesMock).toHaveBeenCalledWith(
        sessionValkeyClient,
        SERVICE_FLUSH_TARGET_PREFIXES.sessions,
        { signal: controller.signal },
      )
      expect(result).toEqual({ concern: 'sessions', keysRemoved: 9 })
    })

    it('propagates the aggregate of multiple session-prefix failures', async () => {
      const aggregate = new AggregateError([new Error('A'), new Error('B')], 'prefix scans failed')
      scanAndUnlinkKeyPrefixesMock.mockRejectedValueOnce(aggregate)

      await expect(flushConcern('sessions', { force: true })).rejects.toBe(aggregate)
    })
  })
})
