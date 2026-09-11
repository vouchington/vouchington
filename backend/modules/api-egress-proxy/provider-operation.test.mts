import { describe, expect, it } from 'vitest'
import {
  createProviderOperationSignal,
  rethrowProviderTransportError,
  withProviderOperationTimeout,
} from './provider-operation.mts'

describe('provider operation timeout', () => {
  it('creates a fresh operation signal without discarding the parent deadline', () => {
    const parent = new AbortController()
    const first = createProviderOperationSignal(parent.signal)
    const second = createProviderOperationSignal(parent.signal)

    expect(first).not.toBe(parent.signal)
    expect(second).not.toBe(parent.signal)
    expect(second).not.toBe(first)
    parent.abort()
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(true)
  })

  it('maps abort and Undici timeout errors to an upstream 502', async () => {
    const abort = new DOMException('Request timed out', 'TimeoutError')
    await expect(
      withProviderOperationTimeout('GitHub', async () => Promise.reject(abort)),
    ).rejects.toMatchObject({
      status: 502,
      cause: abort,
    })

    const timeout = new Error('connect timed out') as Error & { code?: string }
    timeout.code = 'UND_ERR_CONNECT_TIMEOUT'
    const fetchError = new TypeError('fetch failed', { cause: timeout })
    expect(() => rethrowProviderTransportError('X', fetchError)).toThrow(
      /X OAuth provider request timed out/,
    )

    timeout.code = 'UND_ERR_BODY_TIMEOUT'
    const bodyError = new TypeError('terminated', { cause: timeout })
    expect(() => rethrowProviderTransportError('Apple', bodyError)).toThrow(
      /Apple OAuth provider request timed out/,
    )
  })
})
