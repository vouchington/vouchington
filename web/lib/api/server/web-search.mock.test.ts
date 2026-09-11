import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWebSearch } from './web-search'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('getWebSearch', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ results: [], page_info: {} })
  })

  it('calls /api/v1/web-search with default empty options', async () => {
    await getWebSearch()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/web-search', {})
  })

  it('passes search params through to the API', async () => {
    await getWebSearch({ searchParams: { query: 'test query' } })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/web-search', {
      searchParams: { query: 'test query' },
    })
  })
})
