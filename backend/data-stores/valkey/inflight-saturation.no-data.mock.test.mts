/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentryCaptureExceptionMock. No in-file vi.mock, so the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
import { describe, expect, it, vi } from 'vitest'
import type { GlideClient } from '@valkey/valkey-glide'
import { ValkeyCache } from './cache.mts'
import { sentryCaptureExceptionMock as captureException } from '../../test-helpers/vitest.setup.sentry-mock.mts'

// [value, ttlSecondsRemaining, bloomMiss] for a full cache miss with no bloom filter configured.
const MISS_SCRIPT_RESULT = [null, -2, 0]

function saturationError(): Error {
  return new Error('Reached maximum inflight requests')
}

type InvokeScript = () => Promise<unknown>

function fakeClient(invokeScript: ReturnType<typeof vi.fn<InvokeScript>>): GlideClient {
  return new Proxy(
    { invokeScript },
    {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target]
        throw new Error(`GlideClient.${String(prop)} called but not mocked`)
      },
    },
  ) as unknown as GlideClient
}

describe('ValkeyCache inflight-saturation handling', () => {
  it('retries a saturated read and resolves once the retry succeeds', async () => {
    let calls = 0
    const invokeScript = vi.fn<InvokeScript>(() => {
      calls++
      return calls === 1 ? Promise.reject(saturationError()) : Promise.resolve(MISS_SCRIPT_RESULT)
    })
    const cache = new ValkeyCache({
      prefix: `inflight-saturation-read-${crypto.randomUUID()}`,
      ttlSeconds: 60,
      client: fakeClient(invokeScript),
      inflightRetryAttempts: 2,
      inflightRetryDelayMs: 1,
    })

    await expect(cache.get('key')).resolves.toBeNull()
    expect(invokeScript).toHaveBeenCalledTimes(2)
  })

  it('exhausts read retries and rejects rather than hanging past the last attempt', async () => {
    const invokeScript = vi.fn<InvokeScript>(() => Promise.reject(saturationError()))
    const cache = new ValkeyCache({
      prefix: `inflight-saturation-exhaust-${crypto.randomUUID()}`,
      ttlSeconds: 60,
      client: fakeClient(invokeScript),
      inflightRetryAttempts: 2,
      inflightRetryDelayMs: 1,
    })

    await expect(cache.get('key')).rejects.toThrow('Reached maximum inflight requests')
    expect(invokeScript).toHaveBeenCalledTimes(2)
  })

  it('routes a saturated fire-and-forget write-after-miss through onError, never an unhandled rejection', async () => {
    let calls = 0
    const invokeScript = vi.fn<InvokeScript>(() => {
      calls++
      // 1st call: the read, which misses. 2nd call: the write-after-miss populate, which saturates.
      return calls === 1 ? Promise.resolve(MISS_SCRIPT_RESULT) : Promise.reject(saturationError())
    })
    const cache = new ValkeyCache({
      prefix: `inflight-saturation-write-${crypto.randomUUID()}`,
      ttlSeconds: 60,
      client: fakeClient(invokeScript),
    })
    const getByAny = cache.cacheGetByAny((key: string) => Promise.resolve(`fresh-${key}`))

    // The caller gets the freshly computed value immediately — it never awaits the write.
    await expect(getByAny('key')).resolves.toBe('fresh-key')

    // The write's saturation rejection is caught internally and reported, not left dangling:
    // vitest fails the run on a genuine unhandled rejection, so resolving this assertion is
    // direct proof the rejection was handled rather than merely absorbed by test-runner luck.
    await vi.waitFor(
      () => {
        expect(captureException).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Reached maximum inflight requests' }),
          expect.anything(),
        )
      },
      { timeout: 5000 },
    )
  })
})
