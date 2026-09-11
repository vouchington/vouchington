import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

import { fetchCommunityModeratorStats } from './community-moderator-stats'

describe('fetchCommunityModeratorStats', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ window: 30, stats: [], users: {} })
  })

  it('calls clientApi.get with window=30 by default', async () => {
    await fetchCommunityModeratorStats('credit-cards')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/moderator-stats', {
      searchParams: { window: '30' },
    })
  })

  it('calls clientApi.get with window=90 when specified', async () => {
    await fetchCommunityModeratorStats('credit-cards', 90)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/moderator-stats', {
      searchParams: { window: '90' },
    })
  })
})
