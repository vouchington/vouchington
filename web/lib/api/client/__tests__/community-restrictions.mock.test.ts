import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { activateCommunityRestrictions, liftCommunityRestriction } from '../community-restrictions'

const mockDelete = vi.mocked(clientApi.delete)
const mockPost = vi.mocked(clientApi.post)

describe('community-restrictions client', () => {
  afterEach(() => {
    vi.clearAllMocks()
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
