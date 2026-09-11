import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAiCostTotals } from './ai-costs'

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

describe('getAiCostTotals', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
  })

  it('forwards the opaque continuation cursor and bounded limit', async () => {
    await getAiCostTotals({ after: 'opaque/composite+cursor', limit: 25 })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/ai-costs', {
      searchParams: { after: 'opaque/composite+cursor', limit: 25 },
    })
  })
})
