import { describe, expect, it, vi } from 'vitest'
import { handleCachePurgeRequest } from '../cache-purge-route.mts'
import type { EdgeExecutionContext, Env } from '../types.mts'
import { CACHE_PURGE_SECRET_HEADER } from '@ts-shared/cache/purge'
import { MAX_CACHE_TAG_BYTES } from '@ts-shared/cache/cache-tag-encoding'

const SECRET = 'shared-worker-secret'

const buildContext = (purge: (tags: string[]) => ReturnType<typeof mockPurge>) => ({
  waitUntil: () => {},
  exports: {
    CachedOrigin: {
      fetch: () => Promise.reject(new Error('fetch unexpectedly called in this test')),
      purge,
    },
  },
})

const mockPurge = (result: { success: boolean; errors: { code: number; message: string }[] }) =>
  Promise.resolve(result)

const buildRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://staging.voucha.ai/infra/cache-purge', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

describe('handleCachePurgeRequest', () => {
  it('returns 503 when CF_WORKER_SECRET is not configured', async () => {
    const env: Env = {}
    const context = buildContext(() =>
      mockPurge({ success: true, errors: [] }),
    ) as EdgeExecutionContext

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: ['post:abc'] }, { [CACHE_PURGE_SECRET_HEADER]: SECRET }),
      env,
      context,
    )

    expect(response.status).toBe(503)
  })

  it('returns 401 when the secret header is missing', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const context = buildContext(() =>
      mockPurge({ success: true, errors: [] }),
    ) as EdgeExecutionContext

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: ['post:abc'] }),
      env,
      context,
    )

    expect(response.status).toBe(401)
  })

  it('returns 401 when the secret header is wrong', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const context = buildContext(() =>
      mockPurge({ success: true, errors: [] }),
    ) as EdgeExecutionContext

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: ['post:abc'] }, { [CACHE_PURGE_SECRET_HEADER]: 'wrong-secret' }),
      env,
      context,
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 for a missing/empty tags array', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const context = buildContext(() =>
      mockPurge({ success: true, errors: [] }),
    ) as EdgeExecutionContext

    const emptyResponse = await handleCachePurgeRequest(
      buildRequest({ tags: [] }, { [CACHE_PURGE_SECRET_HEADER]: SECRET }),
      env,
      context,
    )
    const missingResponse = await handleCachePurgeRequest(
      buildRequest({}, { [CACHE_PURGE_SECRET_HEADER]: SECRET }),
      env,
      context,
    )
    const wrongTypeResponse = await handleCachePurgeRequest(
      buildRequest({ tags: [1, 2] }, { [CACHE_PURGE_SECRET_HEADER]: SECRET }),
      env,
      context,
    )

    expect(emptyResponse.status).toBe(400)
    expect(missingResponse.status).toBe(400)
    expect(wrongTypeResponse.status).toBe(400)
  })

  it('returns 400 for a malformed JSON body', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const context = buildContext(() =>
      mockPurge({ success: true, errors: [] }),
    ) as EdgeExecutionContext
    const request = new Request('https://staging.voucha.ai/infra/cache-purge', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CACHE_PURGE_SECRET_HEADER]: SECRET },
      body: 'not json',
    })

    const response = await handleCachePurgeRequest(request, env, context)

    expect(response.status).toBe(400)
  })

  it('returns 400 when the tag count exceeds the per-request cap', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const context = buildContext(() =>
      mockPurge({ success: true, errors: [] }),
    ) as EdgeExecutionContext
    const tooManyTags = Array.from({ length: 31 }, (_, i) => `post:${i}`)

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: tooManyTags }, { [CACHE_PURGE_SECRET_HEADER]: SECRET }),
      env,
      context,
    )

    expect(response.status).toBe(400)
  })

  it('rejects a tag Cloudflare would refuse before spending an RPC on the batch', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const purgeSpy = vi.fn<(tags: string[]) => ReturnType<typeof mockPurge>>(() =>
      mockPurge({ success: true, errors: [] }),
    )
    const context = buildContext(purgeSpy) as EdgeExecutionContext

    // One invalid tag fails the whole batch at Cloudflare, so the two good tags would be lost
    // too. Answering 400 here keeps that opaque, retried 502 off the backend's queue.
    const response = await handleCachePurgeRequest(
      buildRequest(
        { tags: ['post:abc', 'topic:new york', 'topic:def'] },
        { [CACHE_PURGE_SECRET_HEADER]: SECRET },
      ),
      env,
      context,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      message: 'Invalid request body',
      code: 'INVALID_INPUT',
    })
    expect(purgeSpy).not.toHaveBeenCalled()
  })

  it('returns 400 for a tag over the Cloudflare length cap', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const purgeSpy = vi.fn<(tags: string[]) => ReturnType<typeof mockPurge>>(() =>
      mockPurge({ success: true, errors: [] }),
    )
    const context = buildContext(purgeSpy) as EdgeExecutionContext

    const response = await handleCachePurgeRequest(
      buildRequest(
        { tags: [`topic:${'a'.repeat(MAX_CACHE_TAG_BYTES)}`] },
        { [CACHE_PURGE_SECRET_HEADER]: SECRET },
      ),
      env,
      context,
    )

    expect(response.status).toBe(400)
    expect(purgeSpy).not.toHaveBeenCalled()
  })

  it('forwards valid tags to CachedOrigin.purge() and returns 200 no-store on success', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const purgeSpy = vi.fn<(tags: string[]) => ReturnType<typeof mockPurge>>(() =>
      mockPurge({ success: true, errors: [] }),
    )
    const context = buildContext(purgeSpy) as EdgeExecutionContext

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: ['post:abc', 'topic:def'] }, { [CACHE_PURGE_SECRET_HEADER]: SECRET }),
      env,
      context,
    )

    expect(purgeSpy).toHaveBeenCalledWith(['post:abc', 'topic:def'])
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ success: true })
  })

  it('returns 502 and logs result.errors when CachedOrigin.purge() reports failure', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const purgeErrors = [{ code: 1, message: 'boom' }]
    const context = buildContext(() =>
      mockPurge({ success: false, errors: purgeErrors }),
    ) as EdgeExecutionContext
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: ['post:abc'] }, { [CACHE_PURGE_SECRET_HEADER]: SECRET }),
      env,
      context,
    )

    expect(response.status).toBe(502)
    expect(consoleErrorSpy).toHaveBeenCalledWith('Cache purge rejected:', purgeErrors)
    consoleErrorSpy.mockRestore()
  })

  it('returns a standardized 502 and logs the exception when CachedOrigin.purge() rejects', async () => {
    const env: Env = { CF_WORKER_SECRET: SECRET }
    const rpcError = new Error('RPC unavailable')
    const context = buildContext(() => Promise.reject(rpcError)) as EdgeExecutionContext
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await handleCachePurgeRequest(
      buildRequest({ tags: ['post:abc'] }, { [CACHE_PURGE_SECRET_HEADER]: SECRET }),
      env,
      context,
    )

    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toEqual({ message: 'Cache purge failed', code: 'BAD_GATEWAY' })
    expect(consoleErrorSpy).toHaveBeenCalledWith('Cache purge threw:', rpcError)
    consoleErrorSpy.mockRestore()
  })
})
