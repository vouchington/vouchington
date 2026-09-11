import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serverApi } from './instance'
import { getMyApiKeys } from './api-keys'

type ServerApi = typeof import('./instance').serverApi

vi.mock(
  import('./instance'),
  () =>
    ({ serverApi: { get: vi.fn<ServerApi['get']>() } }) as unknown as typeof import('./instance'),
)

describe('API key server helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards the continuation cursor, limit, and headers', async () => {
    const page = {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    vi.mocked(serverApi.get).mockResolvedValueOnce(page)

    const result = await getMyApiKeys({
      after: 'cursor-1',
      limit: 25,
      headers: { cookie: 'session=one' },
    })

    expect(serverApi.get).toHaveBeenCalledWith('/api/v1/my/api-keys', {
      headers: { cookie: 'session=one' },
      searchParams: { after: 'cursor-1', limit: 25 },
    })
    expect(result).toBe(page)
  })
})
