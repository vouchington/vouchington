import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCommunityAiAgents } from './communities'
import { ApiError } from '../error'
import {
  getCommunityBans,
  getCommunityModeratorStats,
  getCommunityModlog,
} from './community-moderation'

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

describe('communities server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ community_ai_agents: [] })
  })

  it('calls serverApi.get with the community AI agents endpoint and options', async () => {
    const options = { headers: { 'x-test-request': '1' } }

    await getCommunityAiAgents('credit-cards', options)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/ai-agents', options)
  })

  it('calls serverApi.get with the community bans endpoint and options', async () => {
    mockGet.mockResolvedValue({ results: [], page_info: {}, community_bans: {}, users: {} })
    const options = { headers: { 'x-test-request': '1' } }

    await getCommunityBans('credit-cards', options)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/bans', options)
  })

  it('calls serverApi.get with the community modlog endpoint and options', async () => {
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      moderator_actions: {},
      users: {},
    })
    const options = { headers: { 'x-test-request': '1' } }

    await getCommunityModlog('credit-cards', options)

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/modlog', options)
  })

  it('calls serverApi.get with the community moderator stats endpoint and options', async () => {
    mockGet.mockResolvedValue({ window: 30, stats: [], users: {} })
    const options = { headers: { 'x-test-request': '1' } }

    const result = await getCommunityModeratorStats('credit-cards', options)

    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/communities/credit-cards/moderator-stats',
      options,
    )
    expect(result).toEqual({ window: 30, stats: [], users: {} })
  })

  it('returns null for forbidden community moderator stats', async () => {
    mockGet.mockRejectedValue(new ApiError('Forbidden', 403))

    await expect(getCommunityModeratorStats('credit-cards')).resolves.toBeNull()
  })
})
