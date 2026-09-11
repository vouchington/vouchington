import { describe, expect, it, vi } from 'vitest'
import { retryCacheSaturation, type RetryCacheSaturationDependencies } from './retry-saturation.mts'

class SaturationError extends Error {}

describe('retryCacheSaturation', () => {
  it('retries a saturated cache deletion through its injected boundary', async () => {
    const deleteCacheChunk = vi.fn<() => Promise<void>>()
    let attempts = 0
    const dependencies: RetryCacheSaturationDependencies = {
      config: {
        inflight_retry_attempts: 2,
        inflight_retry_delay_ms: 1,
      },
      retrySaturationError: async operation => {
        try {
          return await operation()
        } catch (error) {
          if (!(error instanceof SaturationError)) throw error
          return operation()
        }
      },
    }
    deleteCacheChunk.mockImplementation(() => {
      attempts++
      if (attempts === 1) return Promise.reject(new SaturationError())
      return Promise.resolve()
    })

    await expect(retryCacheSaturation(deleteCacheChunk, dependencies)).resolves.toBeUndefined()
    expect(deleteCacheChunk).toHaveBeenCalledTimes(2)
  })
})
