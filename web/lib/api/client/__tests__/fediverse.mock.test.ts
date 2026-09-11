import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFediverseSearch } from '../fediverse'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('../instance'),
)

describe('fetchFediverseSearch', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ buckets: [] })
  })

  it('calls the Fediverse search endpoint with joined providers and signal', async () => {
    const signal = new AbortController().signal

    await fetchFediverseSearch({
      q: 'test',
      providers: ['peertube', 'mastodon'],
      type: 'video',
      limit: 5,
      after: 'cursor-1',
      signal,
    })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/fediverse/search', {
      searchParams: {
        q: 'test',
        providers: 'peertube,mastodon',
        type: 'video',
        limit: 5,
        after: 'cursor-1',
      },
      signal,
    })
  })
})
