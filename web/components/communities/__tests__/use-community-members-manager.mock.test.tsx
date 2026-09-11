import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityMembersResponseBody } from '@/types/api-responses'
import { makeCommunity } from '@/test-helpers/api-responses/communities'

const { mockBanMember, mockRefresh } = vi.hoisted(() => ({
  mockBanMember: vi.fn<VitestLooseMock>(),
  mockRefresh: vi.fn<() => void>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client'), () => ({
  banMember: mockBanMember,
  removeMember: vi.fn<VitestLooseMock>(),
  transferOwnership: vi.fn<VitestLooseMock>(),
  updateMemberRole: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/hooks/use-paginated-list'),
  () =>
    ({
      usePaginatedList: (data: CommunityMembersResponseBody) => ({
        pages: [data],
        loadMore: vi.fn<() => void>(),
      }),
    }) as unknown as typeof import('@/hooks/use-paginated-list'),
)

import { useCommunityMembersManager } from '../use-community-members-manager'

const emptyData: CommunityMembersResponseBody = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_members: {},
  users: {},
}

describe('useCommunityMembersManager.handleBan', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('bans a member, closes the dialog, and refreshes', async () => {
    mockBanMember.mockResolvedValueOnce({ community_ban: { id: 'b-1' } })
    const { result } = renderHook(() =>
      useCommunityMembersManager({
        community: makeCommunity(),
        currentUserMembership: null,
        data: emptyData,
      }),
    )

    await act(async () => {
      await result.current.handleBan('u-2', { reason: 'spam', expiresAt: undefined })
    })

    expect(mockBanMember).toHaveBeenCalledWith('test-community', 'u-2', {
      reason: 'spam',
      expiresAt: undefined,
    })
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it('records an error when the ban fails', async () => {
    mockBanMember.mockRejectedValueOnce(new Error('ban failed'))
    const { result } = renderHook(() =>
      useCommunityMembersManager({
        community: makeCommunity(),
        currentUserMembership: null,
        data: emptyData,
      }),
    )

    await act(async () => {
      await result.current.handleBan('u-2')
    })

    expect(result.current.error).toBe('ban failed')
  })
})
