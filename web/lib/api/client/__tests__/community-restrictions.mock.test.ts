import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import type { CommunityRestrictionsResponseBody } from '@/types/api-responses'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  activateCommunityRestrictions,
  liftCommunityRestriction,
  getCommunityRestrictionPage,
} from '../community-restrictions'

const mockDelete = vi.mocked(clientApi.delete)
const mockPost = vi.mocked(clientApi.post)

describe('community-restrictions client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('passes the restriction status and continuation cursor', async () => {
    const response: CommunityRestrictionsResponseBody = {
      results: [],
      community_restrictions: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      raid_mode_suggestion: { velocity_spike: false, flag_count: 0, latest_flagged_at: null },
    }
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.get),
      response,
      call: () => getCommunityRestrictionPage('credit-cards', { status: 'past', after: 'cursor' }),
      expectedArgs: [
        '/api/v1/communities/credit-cards/restrictions',
        { searchParams: { status: 'past', after: 'cursor' } },
      ],
    })
  })

  it('activates community restrictions', async () => {
    const response = { community_restrictions: {} }
    mockPost.mockResolvedValueOnce(response)

    const result = await activateCommunityRestrictions('credit-cards', {
      restrictionTypes: ['require_post_approval', 'no_links'],
      expiresAt: '2026-07-01T00:00:00.000Z',
      reason: 'brigade',
    })

    expect(result).toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/credit-cards/restrictions', {
      restriction_types: ['require_post_approval', 'no_links'],
      expires_at: '2026-07-01T00:00:00.000Z',
      reason: 'brigade',
    })
  })

  it('lifts a community restriction', async () => {
    mockDelete.mockResolvedValueOnce(undefined)

    await liftCommunityRestriction('credit-cards', 'restriction-1')

    expect(mockDelete).toHaveBeenCalledWith(
      '/api/v1/communities/credit-cards/restrictions/restriction-1',
    )
  })
})
