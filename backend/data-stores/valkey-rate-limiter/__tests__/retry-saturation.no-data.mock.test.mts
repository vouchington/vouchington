import { beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '@data-stores/valkey-core/config'
import {
  retryRateLimiterSaturation,
  type RetryRateLimiterSaturationDependencies,
} from '../retry-saturation.mts'

const retryOptions = vi.hoisted(() => [] as Array<{ attempts?: number; delayMs?: number }>)

vi.mock<typeof import('valkyries')>(import('valkyries'), async importOriginal => ({
  ...(await importOriginal()),
  retrySaturationError: async <T,>(
    operation: () => Promise<T>,
    options?: { attempts?: number; delayMs?: number },
  ): Promise<T> => {
    retryOptions.push(options ?? {})
    return operation()
  },
}))

describe('retryRateLimiterSaturation', () => {
  beforeEach(() => {
    retryOptions.length = 0
  })

  it('passes the shared retry configuration to the public helper', async () => {
    await expect(retryRateLimiterSaturation(() => Promise.resolve('ok'))).resolves.toBe('ok')
    expect(retryOptions).toEqual([
      {
        attempts: config.inflight_retry_attempts,
        delayMs: config.inflight_retry_delay_ms,
      },
    ])
  })

  it('honors injected attempt and delay overrides', async () => {
    let receivedOptions: { attempts?: number; delayMs?: number } | undefined
    const dependencies: RetryRateLimiterSaturationDependencies = {
      config: {
        inflight_retry_attempts: 7,
        inflight_retry_delay_ms: 23,
      },
      retryRateLimiterSaturation: async (operation, options) => {
        receivedOptions = options
        return operation()
      },
    }

    await expect(
      retryRateLimiterSaturation(() => Promise.resolve('ok'), dependencies),
    ).resolves.toBe('ok')
    expect(receivedOptions).toEqual({ attempts: 7, delayMs: 23 })
  })
})
