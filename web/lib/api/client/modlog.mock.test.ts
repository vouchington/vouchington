import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCommunityModlog, fetchAdminModlog } from './modlog'

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

const emptyResponse = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  moderator_actions: {},
  users: {},
}

describe('modlog client api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(emptyResponse)
  })

  describe('fetchCommunityModlog', () => {
    it('calls GET /api/v1/communities/:slug/modlog', async () => {
      await fetchCommunityModlog('my-community')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my-community/modlog', {
        searchParams: { after: undefined },
      })
    })

    it('passes after cursor when provided', async () => {
      await fetchCommunityModlog('my-community', 'cursor-abc')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my-community/modlog', {
        searchParams: { after: 'cursor-abc' },
      })
    })
  })

  describe('fetchAdminModlog', () => {
    it('calls GET /api/v1/admin/modlog without params', async () => {
      await fetchAdminModlog()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/modlog', {
        searchParams: {
          community_id: undefined,
          actor_id: undefined,
          action_type: undefined,
          after: undefined,
        },
      })
    })

    it('passes filters when provided', async () => {
      await fetchAdminModlog({
        communityId: 'c-1',
        actorId: 'u-1',
        actionType: 'ban',
        after: 'cursor',
      })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/modlog', {
        searchParams: {
          community_id: 'c-1',
          actor_id: 'u-1',
          action_type: 'ban',
          after: 'cursor',
        },
      })
    })
  })
})
