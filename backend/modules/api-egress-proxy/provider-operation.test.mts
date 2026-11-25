import { describe, expect, it } from 'vitest'
import {
  rethrowProviderTransportError,
  withProviderOperationTimeout,
} from './provider-operation.mts'

describe('provider operation timeout', () => {
  it('maps transport timeouts to a 502 naming the OAuth provider', async () => {
    const abort = new DOMException('Request timed out', 'TimeoutError')
    await expect(
      withProviderOperationTimeout('GitHub', async () => {
        throw abort
      }),
    ).rejects.toMatchObject({
      status: 502,
      message: 'GitHub OAuth provider request timed out',
      cause: abort,
    })

    const timeout = new Error('connect timed out') as Error & { code?: string }
    timeout.code = 'UND_ERR_CONNECT_TIMEOUT'
    const fetchError = new TypeError('fetch failed', { cause: timeout })
    expect(() => rethrowProviderTransportError('X', fetchError)).toThrow(
      /X OAuth provider request timed out/,
    )

    const other = new Error('provider returned 400')
    expect(() => rethrowProviderTransportError('Apple', other)).toThrow(other)
  })
})
