import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { purgeCacheTags } from './purge.mts'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { CACHE_PURGE_SECRET_HEADER, MAX_TAGS_PER_REQUEST } from '@ts-shared/cache'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('purgeCacheTags', () => {
  beforeEach(() => {
    fetchSpy.mockReset()
    vi.stubEnv('CF_WORKER_SECRET', 'test-secret')
    vi.stubEnv('CF_WORKER_ROUTE', 'https://staging.voucha.ai')
    delete process.env.SKIP_CACHE_PURGE
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does nothing when tags is empty', async () => {
    await expect(purgeCacheTags([])).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does nothing when SKIP_CACHE_PURGE is set', async () => {
    vi.stubEnv('SKIP_CACHE_PURGE', 'true')
    await expect(purgeCacheTags(['post:abc'])).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does nothing when CF_WORKER_ROUTE is not configured', async () => {
    vi.stubEnv('CF_WORKER_ROUTE', '')
    await expect(purgeCacheTags(['post:abc'])).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does nothing when CF_WORKER_SECRET is not configured', async () => {
    vi.stubEnv('CF_WORKER_SECRET', '')
    await expect(purgeCacheTags(['post:abc'])).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('POSTs tags to the configured worker route with the shared secret header', async () => {
    fetchSpy.mockResolvedValue({ ok: true })
    await purgeCacheTags(['post:abc', 'user:bob'])

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://staging.voucha.ai/infra/cache-purge',
      expect.objectContaining({
        method: 'POST',
        dispatcher: getExternalRequestDispatcher(),
        headers: expect.objectContaining({
          'content-type': 'application/json',
          [CACHE_PURGE_SECRET_HEADER]: 'test-secret',
        }),
        body: JSON.stringify({ tags: ['post:abc', 'user:bob'] }),
      }),
    )
  })

  it('truncates tags to MAX_TAGS_PER_REQUEST', async () => {
    fetchSpy.mockResolvedValue({ ok: true })
    const tags = Array.from({ length: MAX_TAGS_PER_REQUEST + 5 }, (_, i) => `post:${i}`)
    await purgeCacheTags(tags)

    const body = fetchSpy.mock.calls[0]?.[1]?.body as string
    expect(JSON.parse(body).tags).toHaveLength(MAX_TAGS_PER_REQUEST)
  })

  it('strips a trailing slash from the configured worker route', async () => {
    vi.stubEnv('CF_WORKER_ROUTE', 'https://staging.voucha.ai/')
    fetchSpy.mockResolvedValue({ ok: true })
    await purgeCacheTags(['post:abc'])

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://staging.voucha.ai/infra/cache-purge',
      expect.anything(),
    )
  })

  it('preserves the origin status code when the response is not ok', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 503 })
    await expect(purgeCacheTags(['post:abc'])).rejects.toMatchObject({
      status: 503,
      message: 'Cache purge request failed',
      cause: expect.objectContaining({ message: 'Cache purge HTTP 503' }),
    })
  })

  it('preserves a 401 status so wrapHttpForRetry can classify it as unrecoverable', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 401 })
    await expect(purgeCacheTags(['post:abc'])).rejects.toMatchObject({
      status: 401,
      message: 'Cache purge request failed',
      cause: expect.objectContaining({ message: 'Cache purge HTTP 401' }),
    })
  })

  it('throws a 502 with a cause on network error', async () => {
    const networkError = new Error('Network error')
    fetchSpy.mockRejectedValue(networkError)
    await expect(purgeCacheTags(['post:abc'])).rejects.toMatchObject({
      status: 502,
      message: 'Cache purge request failed',
      cause: networkError,
    })
  })
})
