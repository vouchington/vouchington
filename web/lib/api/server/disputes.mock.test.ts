import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getReviewDisputes } from './disputes'

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

describe('disputes server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      disputes: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
  })

  it('calls /api/v1/disputes with default options', async () => {
    await getReviewDisputes()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/disputes', {})
  })

  it('calls /api/v1/disputes with search params', async () => {
    const options = { searchParams: { limit: 50, cursor: 'abc' } }
    await getReviewDisputes(options)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/disputes', options)
  })
})
