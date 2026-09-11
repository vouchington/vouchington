import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCommunityRestrictions } from './community-restrictions'

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

describe('community restrictions server api helper', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      results: [],
      page_info: {},
      community_restrictions: {},
      raid_mode_suggestion: { velocity_spike: false, flag_count: 0, latest_flagged_at: null },
    })
  })

  it('calls serverApi.get with the community restrictions endpoint and options', async () => {
    const options = { headers: { 'x-test-request': '1' } }

    await getCommunityRestrictions('credit-cards', options)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/restrictions', options)
  })
})
