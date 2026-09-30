import type { EdgeExecutionContext, Env } from '../types.mts'
import { CACHE_PURGE_SECRET_HEADER } from '@ts-shared/cache/purge'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('@sentry/cloudflare')>(import('@sentry/cloudflare'), () => ({
  captureException: vi.fn<VitestLooseMock>(),
  withSentry: vi.fn<VitestLooseMock>((_opts: unknown, handler: unknown) => handler),
}))

const { captureException } = await import('@sentry/cloudflare')
const { handleCachePurgeRequest } = await import('../cache-purge-route.mts')

const SECRET = 'shared-worker-secret'

const buildContext = (
  purge: (
    tags: string[],
  ) => Promise<{ success: boolean; errors: { code: number; message: string }[] }>,
) =>
  ({
    waitUntil: () => {},
    exports: {
      CachedOrigin: {
        fetch: () => Promise.reject(new Error('fetch unexpectedly called in this test')),
        purge,
      },
    },
  }) as EdgeExecutionContext

const buildRequest = (body: unknown) =>
  new Request('https://staging.voucha.ai/infra/cache-purge', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [CACHE_PURGE_SECRET_HEADER]: SECRET,
    },
    body: JSON.stringify(body),
  })

describe('cache purge Sentry capture', () => {
  beforeEach(() => {
    vi.mocked(captureException).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a provider rejection with the tag batch and error payload', async () => {
    const purgeErrors = [{ code: 1, message: 'tag rejected' }]
    const context = buildContext(() => Promise.resolve({ success: false, errors: purgeErrors }))
    const env: Env = { CF_WORKER_SECRET: SECRET }

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: ['post:abc', 'user:jane'] }),
      env,
      context,
    )

    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toEqual({ message: 'Cache purge failed', code: 'BAD_GATEWAY' })
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Cache purge rejected' }),
      {
        tags: { routeTarget: 'cache-purge' },
        extra: {
          cacheTags: ['post:abc', 'user:jane'],
          purgeErrors: [{ code: 1, message: 'tag rejected' }],
        },
      },
    )
  })

  it('reports an RPC rejection with the thrown error and tag batch', async () => {
    const rpcError = new Error('RPC unavailable')
    const context = buildContext(() => Promise.reject(rpcError))
    const env: Env = { CF_WORKER_SECRET: SECRET }

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: ['post:abc'] }),
      env,
      context,
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ message: 'Cache purge failed', code: 'BAD_GATEWAY' })
    expect(captureException).toHaveBeenCalledWith(rpcError, {
      tags: { routeTarget: 'cache-purge' },
      extra: { cacheTags: ['post:abc'] },
    })
  })

  it('does not report an invalid purge body', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const context = buildContext(() => Promise.resolve({ success: true, errors: [] }))

    const response = await handleCachePurgeRequest(buildRequest({ tags: [] }), env, context)

    expect(response.status).toBe(400)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('does not report a successful purge', async () => {
    const context = buildContext(() => Promise.resolve({ success: true, errors: [] }))
    const env: Env = { CF_WORKER_SECRET: SECRET }

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: ['post:abc'] }),
      env,
      context,
    )

    expect(response.status).toBe(200)
    expect(captureException).not.toHaveBeenCalled()
  })
})
