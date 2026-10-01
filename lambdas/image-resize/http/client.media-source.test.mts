import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpOperationError } from '../errors.mts'
import { fetchImageFromUrl } from './client.mts'

const fetchWithPinnedDns = vi.fn<VitestLooseMock>()

function redirectResponse(location: string) {
  return {
    ok: false,
    status: 302,
    statusText: 'Found',
    body: { cancel: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) },
    headers: { get: (name: string) => (name.toLowerCase() === 'location' ? location : null) },
  }
}

describe('sideload source hops', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.MEDIA_SOURCE_HOST_ALIASES
  })

  it('rejects a direct first-party media origin before any fetch', async () => {
    const err = await fetchImageFromUrl(
      'https://images.voucha.ai/photo.jpg',
      undefined,
      undefined,
      {
        fetchWithPinnedDns,
      },
    ).catch((err: unknown) => err)

    expect(err).toBeInstanceOf(HttpOperationError)
    expect((err as HttpOperationError).statusCode).toBe(403)
    expect(fetchWithPinnedDns).not.toHaveBeenCalled()
  })

  it('rejects a redirect onto a first-party media origin before the next hop', async () => {
    fetchWithPinnedDns.mockResolvedValueOnce(
      redirectResponse('https://cdn.images.voucha.ai/stolen.jpg') as never,
    )

    const err = await fetchImageFromUrl('https://cdn.example/photo.jpg', undefined, undefined, {
      fetchWithPinnedDns,
    }).catch((err: unknown) => err)

    expect(err).toBeInstanceOf(HttpOperationError)
    expect((err as HttpOperationError).statusCode).toBe(403)
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(1)
  })

  it('rejects a configured first-party alias before any fetch', async () => {
    process.env.MEDIA_SOURCE_HOST_ALIASES = 'media.partner.test'
    const err = await fetchImageFromUrl(
      'https://edge.media.partner.test/photo.jpg',
      undefined,
      undefined,
      { fetchWithPinnedDns },
    ).catch((err: unknown) => err)

    expect(err).toBeInstanceOf(HttpOperationError)
    expect((err as HttpOperationError).statusCode).toBe(403)
    expect(fetchWithPinnedDns).not.toHaveBeenCalled()
  })
})
