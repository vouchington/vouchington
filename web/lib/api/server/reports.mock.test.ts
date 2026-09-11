import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCommunityPendingModerationReports,
  getMemberPendingModerationReports,
  getPendingModerationReports,
  getStaffPendingModerationReports,
} from './reports'

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

describe('reports server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
  })

  it('calls serverApi.get with the reports endpoint and options', async () => {
    const options = { searchParams: { limit: 50, after: 'cursor' } }
    await getPendingModerationReports(options)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/reports', options)
  })

  it('calls serverApi.get with default options', async () => {
    await getPendingModerationReports()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/reports', {})
  })

  it('calls serverApi.get with clustered report options', async () => {
    const options = { searchParams: { cluster: 'entity' as const, limit: 50 } }
    await getStaffPendingModerationReports(options)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/reports', options)
  })

  it.each([
    ['staff', getStaffPendingModerationReports],
    ['member', getMemberPendingModerationReports],
  ] as const)(
    'calls serverApi.get with default options through the %s helper',
    async (_, getReports) => {
      await getReports()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/reports', {})
    },
  )

  it('calls serverApi.get with the community reports endpoint', async () => {
    const options = { searchParams: { limit: 25 } }
    await getCommunityPendingModerationReports('credit-cards', options)

    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/communities/credit-cards/reports/pending',
      options,
    )
  })

  it('calls getCommunityPendingModerationReports with default options', async () => {
    await getCommunityPendingModerationReports('credit-cards')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/reports/pending', {})
  })
})
