import { describe, expect, it, vi } from 'vitest'
import { dispatchToCachedOrigin, type CacheDispatchInput } from '../cache-dispatch.mts'
import { INTERNAL_CANARY_FAULT_HEADER } from '../staging-control-headers.mts'
import type { EdgeExecutionContext, Env } from '../types.mts'

describe('cache dispatch staging fault relay', () => {
  it('relays only the internal enum header without changing cache-key props', async () => {
    let capturedRequest: Request | undefined
    let capturedProps: unknown
    const context: EdgeExecutionContext = {
      waitUntil: () => {},
      exports: {
        CachedOrigin: {
          fetch: vi.fn<VitestLooseMock>((request: Request, init: unknown) => {
            capturedRequest = request
            capturedProps = init
            return Promise.resolve(
              new Response('failure', { status: 503, headers: { 'cache-control': 'no-store' } }),
            )
          }),
          purge: () => Promise.reject(new Error('unused')),
        },
      },
    }
    const input: CacheDispatchInput = {
      audience: 'anon',
      botTier: null,
      canaryFault: 'sie',
      context,
      cspNonce: 'nonce',
      dispatchUrl: new URL('https://voucha.ai/infra/edge-cache-canary'),
      edgeSession: { kind: 'anon-passthrough' },
      env: {} as Env,
      ip: null,
      isProduction: false,
      isRsc: false,
      method: 'GET',
      requestId: 'request-id',
      target: 'backend',
    }

    await dispatchToCachedOrigin(input)

    expect(capturedRequest?.headers.get(INTERNAL_CANARY_FAULT_HEADER)).toBe('sie')
    expect(capturedProps).toEqual({ props: { audience: 'anon', isRsc: false } })
  })
})
