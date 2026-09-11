import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCommunityAutomodRecentActions } from './community-automod'

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

describe('community-automod server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ actions: [], next_cursor: null })
  })

  it('calls GET /api/v1/communities/:idOrSlug/automod/recent-actions', async () => {
    await getCommunityAutomodRecentActions('my-community')
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/communities/my-community/automod/recent-actions',
      {},
    )
  })

  it('passes search params and headers when provided', async () => {
    await getCommunityAutomodRecentActions('my-community', {
      searchParams: { source_type: 'openai_omni', limit: 10, reviewed: false },
      headers: { 'x-test': '1' },
    })
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/communities/my-community/automod/recent-actions',
      {
        searchParams: { source_type: 'openai_omni', limit: 10, reviewed: false },
        headers: { 'x-test': '1' },
      },
    )
  })
})
